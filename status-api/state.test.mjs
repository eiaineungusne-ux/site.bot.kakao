import test from 'node:test';
import assert from 'node:assert/strict';
import { initial, heartbeat, publicState, adminUpdate, TIMEOUT, BAN_MESSAGE } from './state.mjs';
import worker, { BotStatus } from './worker.mjs';
test('no heartbeat means unknown, not a fabricated outage', () => {
  assert.equal(publicState(initial(), Date.now()).state, 'unknown');
});
test('missing heartbeat creates one incident and recovery resolves it', () => {
  const s = initial(); heartbeat(s, {connected:true,permanentBan:false}, 1000);
  assert.equal(publicState(s, 1000 + TIMEOUT - 1).state, 'online');
  assert.equal(publicState(s, 1000 + TIMEOUT).state, 'offline');
  publicState(s, 200000); assert.equal(s.incidents.length, 1);
  heartbeat(s, {connected:true,permanentBan:false}, 201000);
  assert.equal(s.incidents[0].resolvedAt, 201000);
});
test('permanent restriction persists until successful connection', () => {
  const s = initial(); heartbeat(s, {connected:false,permanentBan:true}, 1000);
  heartbeat(s, {connected:false,permanentBan:false}, 2000);
  assert.equal(publicState(s, 999999).message, BAN_MESSAGE);
  heartbeat(s, {connected:true,permanentBan:false}, 1000000);
  assert.equal(s.ban, false); assert.equal(s.state, 'online');
});
test('admin updates replace default outage message, cannot fake recovery', () => {
  const s = initial(); heartbeat(s, {connected:false,permanentBan:false}, 1000);
  const id = s.incidents[0].id;
  adminUpdate(s, {action:'update',id,stage:'identified',message:'점검 중'}, 2000);
  assert.equal(publicState(s, 2000).message, '점검 중');
  assert.throws(() => adminUpdate(s, {action:'update',id,stage:'resolved',message:'완료'}, 2000));
  adminUpdate(s, {action:'notice',message:'<script>plain text</script>'}, 2000);
  assert.equal(s.notice, '<script>plain text</script>');
  assert.throws(() => adminUpdate(s, {action:'invalid'}, 2000));
});
test('bounded incident history and days', () => {
  const s = initial();
  for (let i=0;i<150;i++) {
    heartbeat(s,{connected:false,permanentBan:false},i*86400000);
    heartbeat(s,{connected:true,permanentBan:false},i*86400000+1000);
  }
  assert.ok(s.incidents.length<=100); assert.ok(Object.keys(s.days).length<=91);
});
test('an ongoing outage carries over midnight and old history expires', () => {
  const s=initial(), start=Date.UTC(2026,8,1,14,59);
  heartbeat(s,{connected:false,permanentBan:false},start);
  const view=publicState(s,start+3*86400000);
  assert.equal(view.days['2026-09-03'],'offline');
  assert.equal(view.days['2026-09-04'],'offline');
  publicState(s,start+100*86400000);
  assert.ok(Object.keys(s.days).length<=91);
});
test('heartbeat authentication and origin validation happen before storage', async () => {
  const env={HEARTBEAT_TOKEN:'test-only',ALLOWED_ORIGINS:'https://kakaobot.xyz'};
  const missing = await worker.fetch(new Request('https://status.test/heartbeat',{method:'POST'}),env);
  assert.equal(missing.status,401);
  const wrong = await worker.fetch(new Request('https://status.test/heartbeat',{method:'POST',headers:{Authorization:'Bearer wrong'}}),env);
  assert.equal(wrong.status,401);
  const origin = await worker.fetch(new Request('https://status.test/status',{headers:{Origin:'https://evil.example'}}),env);
  assert.equal(origin.status,403);
  const admin = await worker.fetch(new Request('https://status.test/admin',{method:'POST'}),env);
  assert.equal(admin.status,403);
});
test('admin read, update and request bounds in storage handler', async () => {
  let state;
  const tx={get:async()=>structuredClone(state),put:async(key,value)=>{state=structuredClone(value);},setAlarm:async()=>{},deleteAlarm:async()=>{}};
  const handler=new BotStatus({storage:{transaction:fn=>fn(tx)}});
  const call=body=>handler.fetch(new Request('https://status.test/admin',{method:'POST',body:JSON.stringify(body)}));
  let res=await call({action:'read'});
  assert.equal(res.status,200); assert.equal((await res.json()).state,'unknown');
  res=await call({action:'notice',message:'점검 중'});
  assert.equal((await res.json()).notice,'점검 중');
  assert.equal((await call({action:'notice',message:'x'.repeat(13000)})).status,413);
});
test('GitHub permission check allows repository writers only', async () => {
  const original=globalThis.fetch;
  let allowed=false;
  globalThis.fetch=async()=>Response.json({permissions:{push:allowed}});
  const env={ADMIN_REPO:'owner/repo',STATUS:{idFromName:()=>1,get:()=>({fetch:async()=>Response.json({ok:true})})}};
  const request=()=>new Request('https://status.test/admin',{method:'POST',headers:{Authorization:'Bearer test-token'}});
  try {
    assert.equal((await worker.fetch(request(),env)).status,403);
    allowed=true; assert.equal((await worker.fetch(request(),env)).status,200);
  } finally {globalThis.fetch=original;}
});

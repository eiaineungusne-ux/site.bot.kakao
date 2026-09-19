import test from 'node:test';
import assert from 'node:assert/strict';
import { initial, heartbeat, publicState, adminUpdate, TIMEOUT, BAN_MESSAGE } from './state.mjs';
import worker, { BotStatus } from './worker.mjs';
import { authorizeAdmin } from './admin-auth.mjs';
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
  assert.equal(admin.status,401);
});
test('admin read, update and request bounds in storage handler', async () => {
  const values=new Map();
  const tx={get:async key=>structuredClone(values.get(key)),put:async(key,value)=>{values.set(key,structuredClone(value));},setAlarm:async()=>{},deleteAlarm:async()=>{}};
  const handler=new BotStatus({storage:{transaction:fn=>fn(tx)}},{ADMIN_PASSWORD:'test-password'});
  const call=body=>handler.fetch(new Request('https://status.test/admin',{method:'POST',headers:{Authorization:'Bearer test-password'},body:JSON.stringify(body)}));
  let res=await call({action:'read'});
  assert.equal(res.status,200); assert.equal((await res.json()).state,'unknown');
  res=await call({action:'notice',message:'점검 중'});
  assert.equal((await res.json()).notice,'점검 중');
  assert.equal((await call({action:'notice',message:'x'.repeat(13000)})).status,413);
});
test('server password is required and failed guesses are rate limited', async () => {
  const values=new Map(), tx={get:async key=>structuredClone(values.get(key)),put:async(key,value)=>values.set(key,structuredClone(value))};
  const storage={transaction:fn=>fn(tx)}, env={ADMIN_PASSWORD:'test-password'};
  const request=password=>new Request('https://status.test/admin',{method:'POST',headers:{Authorization:'Bearer '+password,'CF-Connecting-IP':'192.0.2.1'}});
  assert.equal(await authorizeAdmin(request('test-password'),{},storage,0),503);
  assert.equal(await authorizeAdmin(request('test-password'),env,storage,0),200);
  for(let i=0;i<5;i++) assert.equal(await authorizeAdmin(request('wrong'),env,storage,0),401);
  assert.equal(await authorizeAdmin(request('test-password'),env,storage,0),429);
  assert.equal(await authorizeAdmin(request('test-password'),env,storage,900001),200);
  assert.ok(!JSON.stringify([...values]).includes('test-password'));
});

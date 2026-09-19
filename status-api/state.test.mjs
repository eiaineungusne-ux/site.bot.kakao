import test from 'node:test';
import assert from 'node:assert/strict';
import { initial, heartbeat, publicState, adminUpdate, TIMEOUT, MESSAGES } from './state.mjs';

test('reports every Kakao restriction with its own user-facing state', () => {
  for (const [restriction, state] of [['permanent','permanent_ban'],['temporary','temporary_ban'],['openchat','openchat_ban']]) {
    const s=initial(); heartbeat(s,{connected:false,restriction},1000);
    const view=publicState(s,1000);
    assert.equal(view.state,state); assert.equal(view.message,MESSAGES[state]);
  }
});
test('accepts a legacy permanentBan report during a rolling bot update', () => {
  const s=initial(); heartbeat(s,{connected:false,permanentBan:true},1000);
  assert.equal(publicState(s,1000).state,'permanent_ban');
});
test('migrates persisted state from the original status release without losing it', () => {
  const legacy={lastSeen:1000,state:'offline',ban:false,maintenance:true,incidents:[],days:{'2026-09-19':'offline'},notice:'안내',revision:3};
  const view=publicState(legacy,2000);
  assert.equal(view.state,'maintenance'); assert.equal(view.liveState,'offline'); assert.equal(view.notice,'안내');
  assert.equal(Object.values(view.hours)[0],'offline');
});
test('successful connection resolves automatic restriction record', () => {
  const s=initial(); heartbeat(s,{connected:false,restriction:'temporary'},1000);
  heartbeat(s,{connected:true,restriction:'none'},2000);
  assert.equal(publicState(s,2000).state,'online');
  assert.equal(s.incidents[0].resolvedAt,2000); assert.equal(s.incidents[0].updates[0].stage,'resolved');
});
test('lost heartbeat shows offline and the last day has 24 hourly slots', () => {
  const s=initial(); heartbeat(s,{connected:true,restriction:'none'},1000);
  assert.equal(publicState(s,1000+TIMEOUT).state,'offline');
  for(let h=0;h<30;h++) heartbeat(s,{connected:false,restriction:'none'},1000+h*3600000);
  const view=publicState(s,1000+30*3600000);
  assert.ok(Object.keys(view.hours).length<=25);
});
test('administrator can override every visible state then return to live state', () => {
  const s=initial(); heartbeat(s,{connected:false,restriction:'openchat'},1000);
  adminUpdate(s,{action:'display',state:'maintenance',message:'점검 공지'},2000);
  assert.equal(publicState(s,2000).state,'maintenance'); assert.equal(publicState(s,2000).message,'점검 공지');
  adminUpdate(s,{action:'display',state:'auto',message:''},3000);
  assert.equal(publicState(s,3000).state,'openchat_ban');
});
test('all incident records can be created, edited, deleted and updated', () => {
  const s=initial(); adminUpdate(s,{action:'create',title:'기록',message:'처음'},1000);
  const id=s.incidents[0].id; adminUpdate(s,{action:'edit',id,title:'수정',message:'변경'},2000);
  assert.equal(s.incidents[0].title,'수정'); adminUpdate(s,{action:'delete',id},3000); assert.equal(s.incidents.length,0);
  heartbeat(s,{connected:false,restriction:'permanent'},4000); const auto=s.incidents[0].id;
  adminUpdate(s,{action:'edit',id:auto,title:'관리자 수정',message:'확인 중'},5000);
  adminUpdate(s,{action:'delete',id:auto},6000); assert.equal(s.incidents.length,0);
});

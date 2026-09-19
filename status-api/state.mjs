export const TIMEOUT = 90_000;
export const STATUS = Object.freeze(['online', 'offline', 'permanent_ban', 'temporary_ban', 'openchat_ban', 'maintenance', 'unknown']);
export const TITLES = Object.freeze({
  online: '정상 운영 중', offline: '서버 연결이 끊어졌어요.',
  permanent_ban: '카카오 영구정지', temporary_ban: '카카오톡 임시제한',
  openchat_ban: '오픈채팅 정지', maintenance: '서버 점검중', unknown: '상태 확인 중',
});
export const MESSAGES = Object.freeze({
  online: '밴타봇이 카카오톡에 연결되어 있습니다.',
  offline: '관리자가 원인을 분석하고 있어요.',
  permanent_ban: '관리자가 계정을 복구중이에요.',
  temporary_ban: '임시제한이라 곧 풀릴거에요.',
  openchat_ban: '관리자가 오픈채팅 정지를 먹은 이유를 확인하고 있어요.',
  maintenance: '관리자가 서버 점검을 진행하고 있어요.',
  unknown: '아직 봇 상태 보고를 받지 못했습니다.',
});
const RESTRICTION_TO_STATE = Object.freeze({ permanent: 'permanent_ban', temporary: 'temporary_ban', openchat: 'openchat_ban' });
const rank = { unknown: 0, online: 1, maintenance: 2, offline: 3, temporary_ban: 4, openchat_ban: 5, permanent_ban: 6 };
const kstKey = (at, length) => new Date(at + 9 * 3600000).toISOString().slice(0, length);
const hour = at => kstKey(at, 13);
const day = at => kstKey(at, 10);
const text = (value, limit) => typeof value === 'string' && value.trim() && value.length <= limit;

export function initial() {
  return { lastSeen: null, state: 'unknown', restriction: 'none', manual: null, incidents: [], hours: {}, days: {}, notice: '', revision: 0 };
}
function normalize(s) {
  s.state = STATUS.includes(s.state) ? s.state : 'unknown';
  s.restriction = ['none', 'permanent', 'temporary', 'openchat'].includes(s.restriction) ? s.restriction : s.ban ? 'permanent' : 'none';
  s.manual = s.manual && STATUS.includes(s.manual.state) ? { state: s.manual.state, message: String(s.manual.message || '') } : s.maintenance ? { state: 'maintenance', message: '' } : null;
  s.incidents = Array.isArray(s.incidents) ? s.incidents : [];
  s.hours = s.hours && typeof s.hours === 'object' ? s.hours : {};
  s.days = s.days && typeof s.days === 'object' ? s.days : {};
  s.notice = typeof s.notice === 'string' ? s.notice : '';
  s.revision = Number.isSafeInteger(s.revision) ? s.revision : 0;
  return s;
}
function stateForRestriction(restriction) { return RESTRICTION_TO_STATE[restriction] || 'offline'; }
function record(s, at, state = s.state) {
  const h = hour(at), d = day(at);
  if (!s.hours[h] || rank[state] > rank[s.hours[h]]) s.hours[h] = state;
  if (!s.days[d] || rank[state] > rank[s.days[d]]) s.days[d] = state;
}
function prune(s, now) {
  const currentDay = day(now - 90 * 86400000);
  for (const key of Object.keys(s.hours)) if (key < hour(now - 24 * 3600000)) delete s.hours[key];
  for (const key of Object.keys(s.days)) if (key < currentDay) delete s.days[key];
  s.incidents = s.incidents.filter(item => !item.resolvedAt || item.resolvedAt >= now - 90 * 86400000).slice(0, 100);
  for (const item of s.incidents) item.updates = item.updates.slice(0, 50);
}
function activeAuto(s) { return s.incidents.find(item => item.automatic && !item.resolvedAt); }
function transition(s, next, now) {
  if (s.state === next) { record(s, now, next); return; }
  s.state = next; record(s, now, next);
  if (next === 'online') {
    for (const item of s.incidents.filter(item => item.automatic && !item.resolvedAt)) {
      item.resolvedAt = now;
      item.updates.unshift({ at: now, stage: 'resolved', message: '봇 연결이 복구되었습니다.' });
    }
  } else if (next !== 'unknown') {
    let item = activeAuto(s);
    if (!item) {
      item = { id: crypto.randomUUID(), automatic: true, title: TITLES[next], startedAt: now, resolvedAt: null, updates: [] };
      s.incidents.unshift(item);
    }
    item.title = TITLES[next];
    const latest = item.updates[0];
    if (!latest || latest.message !== MESSAGES[next]) item.updates.unshift({ at: now, stage: 'investigating', message: MESSAGES[next] });
  }
  prune(s, now);
}
export function expire(s, now) {
  normalize(s);
  if (s.lastSeen !== null && now >= s.lastSeen + TIMEOUT && s.state === 'online') transition(s, stateForRestriction(s.restriction), s.lastSeen + TIMEOUT);
}
export function heartbeat(s, report, now) {
  normalize(s);
  expire(s, now);
  s.lastSeen = now;
  if (report.connected) s.restriction = 'none';
  else if (['permanent', 'temporary', 'openchat'].includes(report.restriction)) s.restriction = report.restriction;
  else if (report.permanentBan === true) s.restriction = 'permanent';
  transition(s, report.connected ? 'online' : stateForRestriction(s.restriction), now);
  s.revision++;
}
export function adminUpdate(s, input, now) {
  normalize(s);
  if (!['notice', 'display', 'create', 'update', 'edit', 'delete'].includes(input.action)) throw Error('Unknown action');
  if (input.action === 'notice') {
    if (typeof input.message !== 'string' || input.message.length > 1000) throw Error('안내 문구를 확인하세요.');
    s.notice = input.message.trim();
  } else if (input.action === 'display') {
    if (input.state === 'auto') s.manual = null;
    else {
      if (!STATUS.includes(input.state) || input.state === 'unknown') throw Error('표시 상태를 확인하세요.');
      if (input.message != null && (typeof input.message !== 'string' || input.message.length > 1000)) throw Error('안내 문구를 확인하세요.');
      s.manual = { state: input.state, message: String(input.message || '').trim() };
    }
  } else if (input.action === 'create') {
    if (!text(input.title, 120) || !text(input.message, 2000)) throw Error('제목과 내용을 확인하세요.');
    s.incidents.unshift({ id: crypto.randomUUID(), automatic: false, title: input.title.trim(), startedAt: now, resolvedAt: null, updates: [{ at: now, stage: 'investigating', message: input.message.trim() }] });
  } else if (input.action === 'edit' || input.action === 'delete') {
    const item = s.incidents.find(item => item.id === input.id);
    if (!item) throw Error('기록을 찾지 못했습니다.');
    if (input.action === 'delete') s.incidents = s.incidents.filter(candidate => candidate.id !== item.id);
    else {
      if (!text(input.title, 120) || !text(input.message, 2000)) throw Error('제목과 내용을 확인하세요.');
      item.title = input.title.trim(); item.updates[item.updates.length - 1].message = input.message.trim(); item.editedAt = now;
    }
  } else {
    const item = s.incidents.find(item => item.id === input.id);
    if (!item || item.resolvedAt) throw Error('진행 중인 기록을 찾지 못했습니다.');
    if (!['investigating', 'identified', 'monitoring', 'resolved'].includes(input.stage) || !text(input.message, 2000)) throw Error('업데이트 내용을 확인하세요.');
    item.updates.unshift({ at: now, stage: input.stage, message: input.message.trim() });
    if (input.stage === 'resolved') item.resolvedAt = now;
  }
  prune(s, now); s.revision++;
}
export function publicState(s, now) {
  normalize(s);
  expire(s, now); record(s, now); prune(s, now);
  const automatic = activeAuto(s), manual = s.manual?.state ? s.manual : null;
  const display = manual?.state || s.state;
  return { state: display, liveState: s.state, restriction: s.restriction, manual: manual ? { state: manual.state, message: manual.message || '' } : null,
    title: TITLES[display], lastSeen: s.lastSeen, checkedAt: now, timeoutSeconds: TIMEOUT / 1000,
    message: manual?.message || (display === s.state && automatic?.updates[0]?.message) || MESSAGES[display], notice: s.notice,
    incidents: s.incidents, hours: s.hours, days: s.days, revision: s.revision };
}

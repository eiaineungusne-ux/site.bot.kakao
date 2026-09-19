export const TIMEOUT = 90_000;
export const DEFAULT_MESSAGE = '관리자가 원인을 분석하고 있어요';
export const BAN_MESSAGE = '카카오 영구정지로 인해 관리자가 복구중이에요';
export const TITLES = { online: '정상 운영 중', offline: '서버 연결이 끊어졌어요.', permanent_ban: '카카오 영구정지', unknown: '상태 확인 중' };
const day = at => new Date(at + 9 * 3600000).toISOString().slice(0, 10);
const order = { unknown: 0, online: 1, offline: 2, permanent_ban: 3 };
function recordDay(s, at, state = s.state) {
  const key = day(at);
  if (state !== 'unknown' && (!s.days[key] || order[state] > order[s.days[key]])) s.days[key] = state;
}
function advance(s, now) {
  const from = Math.max(s.observedThrough ?? now, now - 90 * 86400000);
  for (let at = from; at < now; at += 86400000) recordDay(s, at);
  recordDay(s, now);
  s.observedThrough = now;
  for (const key of Object.keys(s.days)) if (key < day(now - 90 * 86400000)) delete s.days[key];
}
function compact(s, now) {
  // Refresh legacy automatic wording without overwriting administrator updates.
  for (const item of s.incidents) {
    if (!item.automatic) continue;
    if (item.title === '서버 터짐') item.title = TITLES.offline;
    for (const update of item.updates) {
      if (update.at === item.startedAt && update.stage === 'investigating' && update.message === '관리자가 서버 상태를 확인하고 재정비 하고있어요.') update.message = DEFAULT_MESSAGE;
    }
  }
  s.incidents = s.incidents.filter(i => !i.resolvedAt || i.resolvedAt >= now - 90 * 86400000).slice(0, 100);
  for (const item of s.incidents) item.updates = item.updates.slice(0, 50);
  // Durable Object values have a size limit. Keep a bounded public response too.
  while (new TextEncoder().encode(JSON.stringify(s)).byteLength > 700000 && s.incidents.length > 1) s.incidents.pop();
}
export function initial() {
  return { lastSeen: null, state: 'unknown', ban: false, incidents: [], days: {}, notice: '', revision: 0 };
}
function transition(s, next, now) {
  if (s.state === next) return;
  advance(s, now);
  s.state = next;
  if (next === 'online') {
    for (const item of s.incidents.filter(i => i.automatic && !i.resolvedAt)) {
      item.resolvedAt = now;
      item.updates.unshift({ at: now, message: '봇 연결이 복구되었습니다.', stage: 'resolved' });
    }
  } else if (next !== 'unknown') {
    let item = s.incidents.find(i => i.automatic && !i.resolvedAt);
    const message = next === 'permanent_ban' ? BAN_MESSAGE : DEFAULT_MESSAGE;
    if (!item) {
      item = { id: crypto.randomUUID(), title: TITLES[next], startedAt: now, resolvedAt: null, automatic: true, updates: [] };
      s.incidents.unshift(item);
    }
    item.title = TITLES[next];
    item.updates.unshift({ at: now, stage: 'investigating', message });
  }
  compact(s, now);
  recordDay(s, now, next);
}
export function expire(s, now) {
  if (s.lastSeen !== null && now >= s.lastSeen + TIMEOUT && s.state === 'online') {
    transition(s, s.ban ? 'permanent_ban' : 'offline', s.lastSeen + TIMEOUT);
  }
}
export function heartbeat(s, report, now) {
  expire(s, now);
  s.lastSeen = now;
  // A fresh successful connection clears a prior ban. Stale/offline reports cannot.
  if (report.connected) s.ban = false;
  else if (report.permanentBan) s.ban = true;
  transition(s, report.connected ? 'online' : s.ban ? 'permanent_ban' : 'offline', now);
  advance(s, now);
  s.revision++;
}
export function adminUpdate(s, input, now) {
  if (!['notice', 'create', 'update'].includes(input.action)) throw Error('Unknown action');
  if (input.action === 'notice') {
    if (typeof input.message !== 'string' || input.message.length > 1000) throw Error('안내 문구는 1,000자 이내로 입력하세요.');
    s.notice = input.message.trim();
  } else if (input.action === 'create') {
    if (!input.title?.trim() || !input.message?.trim()) throw Error('제목과 내용을 입력하세요.');
    s.incidents.unshift({ id: crypto.randomUUID(), title: input.title.trim().slice(0, 120), startedAt: now,
      resolvedAt: null, automatic: false, updates: [{ at: now, stage: 'investigating', message: input.message.trim().slice(0, 2000) }] });
  } else {
    const item = s.incidents.find(i => i.id === input.id);
    if (!item) throw Error('장애 기록을 찾지 못했습니다.');
    if (item.resolvedAt) throw Error('이미 종료된 기록입니다.');
    if (!['investigating', 'identified', 'monitoring', 'resolved'].includes(input.stage)) throw Error('잘못된 진행 상태입니다.');
    if (item.automatic && input.stage === 'resolved' && s.state !== 'online') throw Error('봇 연결이 복구되면 자동으로 해결 처리됩니다.');
    if (!input.message?.trim()) throw Error('업데이트 내용을 입력하세요.');
    item.updates.unshift({ at: now, stage: input.stage, message: input.message.trim().slice(0, 2000) });
    item.updates = item.updates.slice(0, 50);
    if (input.stage === 'resolved') item.resolvedAt = now;
  }
  compact(s, now);
  s.revision++;
}
export function publicState(s, now) {
  expire(s, now);
  advance(s, now);
  compact(s, now);
  const active = s.incidents.filter(i => !i.resolvedAt);
  const automatic = active.find(i => i.automatic);
  return { state: s.state, title: TITLES[s.state], lastSeen: s.lastSeen, checkedAt: now, timeoutSeconds: TIMEOUT / 1000,
    message: s.state === 'online' ? '밴타봇이 카카오톡에 연결되어 있습니다.' :
      s.state === 'unknown' ? '아직 봇 상태 보고를 받지 못했습니다.' :
      automatic?.updates[0]?.message || (s.ban ? BAN_MESSAGE : DEFAULT_MESSAGE),
    notice: s.notice, incidents: s.incidents, days: s.days, revision: s.revision };
}

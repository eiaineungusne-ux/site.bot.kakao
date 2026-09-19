const $ = id => document.getElementById(id);
const labels = { online: '정상', offline: '연결 끊김', permanent_ban: '영구 이용제한', maintenance: '점검중', unknown: '확인 중' };
const stages = { investigating: '확인 중', identified: '원인 확인', monitoring: '복구 확인 중', resolved: '해결됨' };
const date = at => new Date(at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
let api, working = false;
export async function apiBase() {
  const response = await fetch('/assets/status-config.json', { cache: 'no-store' });
  if (!response.ok) throw Error('상태 연결 설정을 읽지 못했습니다.');
  const config = await response.json();
  if (!config.apiBase) throw Error('상태 수신 서버 연결을 준비 중입니다.');
  const url = new URL(config.apiBase);
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw Error('상태 서버 주소를 확인하세요.');
  return url.origin;
}
function node(tag, text, className) { const el = document.createElement(tag); el.textContent = text; if (className) el.className = className; return el; }
export function renderIncidents(container, items) {
  container.replaceChildren();
  if (!items.length) { container.append(node('p', '아직 등록된 장애 기록이 없습니다.', 'status-small')); return; }
  for (const item of items) {
    const card = node('article', '', 'incident');
    card.append(node('span', item.resolvedAt ? '해결됨' : '진행 중', 'incident-tag' + (item.resolvedAt ? ' resolved' : '')),
      node('h3', item.title));
    const previous = node('details', '');
    if (item.updates.length > 1) previous.append(node('summary', '이전 업데이트 ' + (item.updates.length - 1) + '개'));
    for (const [index, update] of item.updates.entries()) {
      const row = node('div', '', 'incident-update');
      const time = node('time', date(update.at)); time.dateTime = new Date(update.at).toISOString();
      row.append(node('strong', stages[update.stage] || '안내'), node('p', update.message), time);
      (index === 0 ? card : previous).append(row);
    }
    if (item.updates.length > 1) card.append(previous);
    container.append(card);
  }
}
function render(s) {
  const state = Object.hasOwn(labels, s.state) ? s.state : 'unknown';
  $('status-banner').className = 'status-banner ' + state;
  $('status-title').textContent = s.title; $('status-message').textContent = s.message;
  $('component-state').textContent = labels[state];
  $('status-meta').textContent = (s.lastSeen ? '마지막 상태 보고: ' + date(s.lastSeen) : '아직 상태 보고 없음') + ' · 30초마다 갱신';
  $('status-notice').hidden = !s.notice; $('notice-message').textContent = s.notice || '';
  const bars = $('history-bars'); bars.replaceChildren();
  for (let i = 29; i >= 0; i--) {
    const key = new Date(s.checkedAt + 9 * 3600000 - i * 86400000).toISOString().slice(0,10);
    const value = Object.hasOwn(labels, s.days[key]) ? s.days[key] : 'unknown';
    const bar = node('span', '', value); bar.title = key + ': ' + (value === 'unknown' ? '기록 없음' : labels[value]); bar.tabIndex = 0;
    bar.setAttribute('aria-label', bar.title); bars.append(bar);
  }
  renderIncidents($('incidents'), s.incidents);
}
async function refresh() {
  if (working) return; working = true; $('refresh').disabled = true;
  try {
    api ||= await apiBase();
    const response = await fetch(api + '/status', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw Error('상태 수신 서버에 연결하지 못했습니다.');
    render(await response.json());
  } catch (error) {
    $('status-banner').className = 'status-banner unknown';
    $('status-title').textContent = '상태 확인 불가';
    $('status-message').textContent = error.message;
    $('component-state').textContent = '확인 불가';
    $('status-notice').hidden = true;
    $('history-bars').replaceChildren();
    $('status-meta').textContent = '최신 상태를 확인하지 못했습니다. 잠시 후 다시 확인합니다.';
    $('incidents').replaceChildren(node('p', '최신 기록을 불러오지 못했습니다.', 'status-small'));
  } finally { working = false; $('refresh').disabled = false; }
}
if ($('status-banner')) {
  $('refresh').addEventListener('click', refresh);
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}

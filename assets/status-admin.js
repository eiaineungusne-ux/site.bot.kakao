import { apiBase, renderIncidents } from './status.js?v=20260919';
const $ = id => document.getElementById(id);
let token = '', api = '', busy = false;
function show(message, ok = false) { $('admin-result').textContent = message; $('admin-result').className = ok ? 'status-ok' : 'status-error'; }
function render(data) {
  $('notice').value = data.notice || '';
  const select = $('incident-id'); select.replaceChildren();
  for (const item of data.incidents.filter(i => !i.resolvedAt)) {
    const option = document.createElement('option'); option.value = item.id; option.textContent = item.title; select.append(option);
  }
  renderIncidents($('admin-incidents'), data.incidents);
}
async function request(payload) {
  api ||= await apiBase();
  const response = await fetch(api + '/admin', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || '저장 실패');
  return result;
}
async function save(payload) {
  if (busy) return; busy = true;
  document.querySelectorAll('button').forEach(b => b.disabled = true);
  try { render(await request(payload)); show('공개 상태 페이지에 반영했습니다.', true); }
  catch (error) { show(error.message); }
  finally { busy = false; document.querySelectorAll('button').forEach(b => b.disabled = false); }
}
$('auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  token = $('token').value;
  $('token').value = '';
  try {
    const data = await request({ action: 'read' });
    $('token').value = ''; $('auth-form').hidden = true; $('logout').hidden = false; $('admin-panels').hidden = false;
    render(data); show('관리자 권한을 확인했습니다.', true);
  } catch (error) { token = ''; show(error.message); }
  finally { busy = false; }
});
$('logout').addEventListener('click', () => { token = ''; $('token').value = ''; $('admin-panels').hidden = true; $('auth-form').hidden = false; $('logout').hidden = true; show('로그아웃했습니다.', true); });
$('notice-form').addEventListener('submit', event => { event.preventDefault(); save({ action: 'notice', message: $('notice').value }); });
$('create-form').addEventListener('submit', event => { event.preventDefault(); save({ action: 'create', title: $('incident-title').value, message: $('incident-message').value }); });
$('update-form').addEventListener('submit', event => { event.preventDefault(); save({ action: 'update', id: $('incident-id').value, stage: $('stage').value, message: $('update-message').value }); });

import { apiBase, renderIncidents } from './status.js?v=20260922';
const $ = id => document.getElementById(id);
let token = '', api = '', busy = false, records = [], expiryTimer;
function show(message, ok = false) { $('admin-result').textContent = message; $('admin-result').className = ok ? 'status-ok' : 'status-error'; }
function resetLogin() {
  token = ''; clearTimeout(expiryTimer); records = [];
  $('token').value = ''; $('admin-panels').hidden = true; $('auth-form').hidden = false; $('logout').hidden = true;
  document.body.classList.remove('authenticated'); $('admin-incidents').replaceChildren();
}
function selectedNotice() {
  const item = records.find(i => i.id === $('manage-id').value);
  const updates = item?.updates || [];
  populateUpdates(updates);
  $('edit-title').value = item?.title || '';
  $('edit-message').value = updates[Number($('edit-update-index').value)]?.message || '';
  $('edit-fields').disabled = !item;
}
function populateUpdates(updates) {
  const select = $('edit-update-index'), previous = select.value; select.replaceChildren();
  updates.forEach((update, index) => {
    const option = document.createElement('option'); option.value = String(index);
    option.textContent = new Date(update.at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) + ' · ' + (update.stage === 'resolved' ? '해결됨' : '진행 기록');
    select.append(option);
  });
  if (updates[Number(previous)]) select.value = previous;
}
function selectedUpdate() {
  const item = records.find(i => i.id === $('manage-id').value);
  $('edit-message').value = item?.updates[Number($('edit-update-index').value)]?.message || '';
}
function populate(id, items) {
  const select = $(id), previous = select.value; select.replaceChildren();
  for (const item of items) {
    const option = document.createElement('option'); option.value = item.id; option.textContent = item.title; select.append(option);
  }
  if (items.some(i => i.id === previous)) select.value = previous;
  if (!items.length) { const option = document.createElement('option'); option.value = ''; option.textContent = '등록된 공지가 없습니다'; select.append(option); }
}
function render(data) {
  records = data.incidents; $('notice').value = data.notice || '';
  $('display-state').value = data.manual?.state || 'auto';
  $('display-message').value = data.manual?.message || '';
  populate('incident-id', records.filter(i => !i.resolvedAt));
  populate('manage-id', records);
  selectedNotice(); renderIncidents($('admin-incidents'), records);
}
async function request(payload, route = '/admin', credential = token) {
  api ||= await apiBase();
  const response = await fetch(api + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + credential }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  if (!response.ok) { if (response.status === 401 && route === '/admin') resetLogin(); throw Error(result.error || '요청을 처리하지 못했습니다.'); }
  return result;
}
async function save(payload) {
  if (busy) return; busy = true; document.querySelectorAll('button,input,select,textarea').forEach(x => x.disabled = true);
  try { render(await request(payload)); show(payload.action === 'delete' ? '공지를 삭제했습니다.' : '저장했습니다.', true); }
  catch (error) { show(error.message); }
  finally { busy = false; document.querySelectorAll('button,input,select,textarea').forEach(x => x.disabled = false); }
}
$('auth-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return; busy = true;
  let password = $('token').value; $('token').value = '';
  try {
    const session = await request({}, '/login', password); password = ''; token = session.token;
    const data = await request({ action: 'read' });
    $('auth-form').hidden = true; $('logout').hidden = false; $('admin-panels').hidden = false; document.body.classList.add('authenticated');
    clearTimeout(expiryTimer); expiryTimer = setTimeout(() => { resetLogin(); show('다시 로그인해 주세요.'); }, Math.max(0, Math.min(30 * 60000, session.expiresAt - Date.now())));
    render(data); show('');
  } catch (error) { resetLogin(); show(error.message); }
  finally { password = ''; busy = false; }
});
$('logout').addEventListener('click', async () => { const credential = token; resetLogin(); try { await request({}, '/logout', credential); } catch {} show('로그아웃했습니다.', true); });
$('display-form').addEventListener('submit', event => { event.preventDefault(); save({ action: 'display', state: $('display-state').value, message: $('display-message').value }); });
$('notice-form').addEventListener('submit', event => { event.preventDefault(); save({ action: 'notice', message: $('notice').value }); });
$('notice-delete').addEventListener('click', () => { if (confirm('운영 안내를 삭제할까요?')) save({action:'notice',message:''}); });
$('create-form').addEventListener('submit', event => { event.preventDefault(); save({ action: 'create', title: $('incident-title').value, message: $('incident-message').value }); });
$('update-form').addEventListener('submit', event => { event.preventDefault(); save({ action: 'update', id: $('incident-id').value, stage: $('stage').value, message: $('update-message').value }); });
$('manage-id').addEventListener('change', selectedNotice);
// A message can be removed independently; the server removes the parent record
// as well when it was the last message.
$('update-remove').addEventListener('click', () => { if ($('manage-id').value && confirm('선택한 메시지를 삭제할까요?')) save({ action: 'delete_update', id: $('manage-id').value, updateIndex: Number($('edit-update-index').value) }); });
$('edit-update-index').addEventListener('change', selectedUpdate);
$('edit-form').addEventListener('submit', event => { event.preventDefault(); save({action:'edit',id:$('manage-id').value,updateIndex:Number($('edit-update-index').value),title:$('edit-title').value,message:$('edit-message').value}); });
$('notice-remove').addEventListener('click', () => { if ($('manage-id').value && confirm('이 공지를 삭제할까요? 삭제한 공지는 복구할 수 없습니다.')) save({action:'delete',id:$('manage-id').value}); });

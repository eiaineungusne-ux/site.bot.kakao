import { initial, heartbeat, expire, publicState, adminUpdate, TIMEOUT } from './state.mjs';
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
async function equalSecret(a, b) {
  if (!a || !b) return false;
  const bytes = value => new TextEncoder().encode(value);
  const [x, y] = await Promise.all([a, b].map(value => crypto.subtle.digest('SHA-256', bytes(value))));
  const xa = new Uint8Array(x), ya = new Uint8Array(y);
  let different = 0;
  for (let i = 0; i < xa.length; i++) different |= xa[i] ^ ya[i];
  return different === 0;
}
async function isAdmin(request, env) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!token || token.length > 512) return false;
  const result = await fetch('https://api.github.com/repos/' + env.ADMIN_REPO, {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'VentaBot-Status' },
    signal: AbortSignal.timeout(8000),
  });
  if (!result.ok) return false;
  const repo = await result.json();
  return repo.permissions?.push === true || repo.permissions?.admin === true;
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const origins = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const cors = { 'Vary': 'Origin', 'Cache-Control': 'no-store' };
    if (origins.includes(origin)) cors['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') return new Response(null, { status: origin && !origins.includes(origin) ? 403 : 204,
      headers: { ...cors, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type' } });
    let response;
    try {
      if (origin && !origins.includes(origin)) response = json({ error: '허용되지 않은 출처입니다.' }, 403);
      else if (url.pathname === '/heartbeat' && request.method === 'POST') {
        const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
        response = await equalSecret(token, env.HEARTBEAT_TOKEN)
          ? await env.STATUS.get(env.STATUS.idFromName('ventabot')).fetch(request)
          : json({ error: '인증 실패' }, 401);
      } else if (url.pathname === '/status' && request.method === 'GET') {
        response = await env.STATUS.get(env.STATUS.idFromName('ventabot')).fetch(request);
      } else if (url.pathname === '/admin' && request.method === 'POST') {
        response = await isAdmin(request, env)
          ? await env.STATUS.get(env.STATUS.idFromName('ventabot')).fetch(request)
          : json({ error: '사이트 저장소 쓰기 권한이 있는 GitHub 토큰이 필요합니다.' }, 403);
      } else response = json({ error: 'Not found' }, 404);
    } catch { response = json({ error: '상태 서버 요청을 처리하지 못했습니다.' }, 503); }
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(cors)) headers.set(key, value);
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(response.body, { status: response.status, headers });
  }
};
export class BotStatus {
  constructor(ctx) { this.ctx = ctx; }
  async alarm() {
    await this.ctx.storage.transaction(async tx => {
      const s = await tx.get('state') || initial();
      expire(s, Date.now());
      await tx.put('state', s);
    });
  }
  async fetch(request) {
    const route = new URL(request.url).pathname;
    let input;
    if (request.method === 'POST') {
      const reader = request.body?.getReader();
      const chunks = []; let size = 0;
      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 12000) { await reader.cancel(); return json({ error: '요청이 너무 큽니다.' }, 413); }
          chunks.push(value);
        }
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const raw = new TextDecoder().decode(bytes);
      try { input = JSON.parse(raw); } catch { return json({ error: '잘못된 JSON' }, 400); }
      if (!input || typeof input !== 'object') return json({ error: '잘못된 요청' }, 400);
      if (route === '/heartbeat' && (typeof input.connected !== 'boolean' || typeof input.permanentBan !== 'boolean')) return json({ error: '잘못된 상태 보고' }, 400);
    }
    try {
      return await this.ctx.storage.transaction(async tx => {
        const now = Date.now(), s = await tx.get('state') || initial();
        expire(s, now);
        if (route === '/heartbeat') {
          heartbeat(s, input, now);
          if (s.state === 'online') await tx.setAlarm(now + TIMEOUT);
          else await tx.deleteAlarm();
        } else if (route === '/admin' && input.action !== 'read') adminUpdate(s, input, now);
        const output = publicState(s, now);
        await tx.put('state', s);
        return json(route === '/heartbeat' ? { ok: true } : output);
      });
    } catch { return json({ error: '내용·진행 상태를 확인하세요. 연결 중단은 복구 후 자동 해결됩니다.' }, 400); }
  }
}

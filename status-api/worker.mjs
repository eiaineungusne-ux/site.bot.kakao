import { initial, heartbeat, expire, publicState, adminUpdate, TIMEOUT } from './state.mjs';
import { equalSecret, authorizeAdmin, createSession, checkSession } from './admin-auth.mjs';
import { statusDocument, adminDocument } from './site.mjs';
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const STATUS_HOST = 'venta.kakaobot.xyz';
const PAGES_ORIGIN = 'https://kakaobot.xyz';

// venta.kakaobot.xyz is a status-only hostname. The Worker owns both entry
// documents; only their versioned static assets are read from Pages.
async function serveStatusSite(request, url) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  if (url.pathname === '/' || url.pathname === '/index.html') return statusPage(statusDocument);
  if (url.pathname === '/admin' || url.pathname === '/admin/' || url.pathname === '/admin/index.html') return statusPage(adminDocument);
  if (!url.pathname.startsWith('/assets/')) return new Response('Not found', { status: 404 });

  // Only static resources that are needed by the status and admin pages are
  // requested from the Pages origin. Query strings are preserved for cache
  // busting, while credentials and user supplied forwarding headers are not.
  const upstream = new URL(url.pathname, PAGES_ORIGIN);
  upstream.search = url.search;
  const response = await fetch(new Request(upstream, {
    method: request.method,
    headers: {
      Accept: request.headers.get('Accept') || '*/*',
      'Accept-Language': request.headers.get('Accept-Language') || 'ko'
    }
  }));
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  return new Response(response.body, { status: response.status, headers });
}

function statusPage(document) {
  return new Response(document, { headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://ventabot-status.haish795.workers.dev; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests"
  } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === STATUS_HOST) return serveStatusSite(request, url);
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
      } else if (['/admin', '/login', '/logout'].includes(url.pathname) && request.method === 'POST') {
        response = request.headers.get('Authorization')?.startsWith('Bearer ')
          ? await env.STATUS.get(env.STATUS.idFromName('ventabot')).fetch(request)
          : json({ error: '관리자 비밀번호를 입력하세요.' }, 401);
      } else response = json({ error: 'Not found' }, 404);
    } catch { response = json({ error: '상태 서버 요청을 처리하지 못했습니다.' }, 503); }
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(cors)) headers.set(key, value);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    return new Response(response.body, { status: response.status, headers });
  }
};
export class BotStatus {
  constructor(ctx, env = {}) { this.ctx = ctx; this.env = env; }
  async alarm() {
    await this.ctx.storage.transaction(async tx => {
      const s = await tx.get('state') || initial();
      expire(s, Date.now());
      await tx.put('state', s);
    });
  }
  async fetch(request) {
    const route = new URL(request.url).pathname;
    if (route === '/login') {
      const status = await authorizeAdmin(request, this.env, this.ctx.storage);
      if (status !== 200) return json({ error: status === 429 ? '로그인 시도가 너무 많습니다. 15분 후 다시 시도하세요.' : status === 503 ? '관리자 비밀번호가 아직 설정되지 않았습니다.' : '비밀번호가 올바르지 않습니다.' }, status);
      return json(await createSession(this.env, this.ctx.storage));
    }
    if (route === '/admin' || route === '/logout') {
      if (!await checkSession(request, this.env, this.ctx.storage, route === '/logout')) return json({ error: '다시 로그인해 주세요.' }, 401);
      if (route === '/logout') return json({ ok: true });
    }
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
      if (route === '/heartbeat' && (typeof input.connected !== 'boolean' || (!['none', 'permanent', 'temporary', 'openchat'].includes(input.restriction) && typeof input.permanentBan !== 'boolean'))) return json({ error: '잘못된 상태 보고' }, 400);
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

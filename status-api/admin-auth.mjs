// Passwords stay in Worker Secrets, never in a public asset or persisted request log.
export async function equalSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b || a.length > 512) return false;
  const bytes = value => new TextEncoder().encode(value);
  const [x, y] = await Promise.all([a, b].map(value => crypto.subtle.digest('SHA-256', bytes(value))));
  const xa = new Uint8Array(x), ya = new Uint8Array(y);
  let different = 0;
  for (let i = 0; i < xa.length; i++) different |= xa[i] ^ ya[i];
  return different === 0;
}
export async function authorizeAdmin(request, env, storage, now = Date.now()) {
  if (!env.ADMIN_PASSWORD) return 503;
  const header = request.headers.get('Authorization') || '';
  const password = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!password || password.length > 512) return 401;
  // Cloudflare sets CF-Connecting-IP. Store a short-lived hash, not the IP itself.
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  const key = Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('');
  return storage.transaction(async tx => {
    let limits = await tx.get('admin-attempts');
    if (!limits || now >= limits.until) limits = { until: now + 15 * 60000, failures: 0, ips: {} };
    if ((limits.ips[key] || 0) >= 5 || limits.failures >= 100) return 429;
    if (!await equalSecret(password, env.ADMIN_PASSWORD)) {
      limits.ips[key] = (limits.ips[key] || 0) + 1;
      limits.failures++;
      await tx.put('admin-attempts', limits);
      return 401;
    }
    delete limits.ips[key];
    await tx.put('admin-attempts', limits);
    return 200;
  });
}
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), x => x.toString(16).padStart(2,'0')).join('');
export async function createSession(env, storage, now = Date.now()) {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2,'0')).join('');
  const entry = { hash: await digest(token), expiresAt: now + 30 * 60000, passwordVersion: await digest(env.ADMIN_PASSWORD) };
  await storage.transaction(async tx => {
    const sessions = (await tx.get('admin-sessions') || []).filter(s => s.expiresAt > now).slice(-15);
    sessions.push(entry); await tx.put('admin-sessions', sessions);
  });
  return { token, expiresAt: entry.expiresAt };
}
export async function checkSession(request, env, storage, revoke = false, now = Date.now()) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer /,'') || '';
  if (!env.ADMIN_PASSWORD || !/^[a-f0-9]{64}$/.test(token)) return false;
  const hash = await digest(token), passwordVersion = await digest(env.ADMIN_PASSWORD);
  return storage.transaction(async tx => {
    const sessions = await tx.get('admin-sessions') || [];
    const valid = sessions.some(s => s.hash === hash && s.expiresAt > now && s.passwordVersion === passwordVersion);
    if (revoke) await tx.put('admin-sessions', sessions.filter(s => s.hash !== hash && s.expiresAt > now));
    return valid;
  });
}

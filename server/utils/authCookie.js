/**
 * JWT en cookie HttpOnly (anti-XSS).
 * Cross-origin (front ≠ API) → SameSite=None; Secure.
 * Même site (ex. localhost:3000 → localhost:5002) → Lax, Secure optionnel.
 */
const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'synapta_at';

function parseDurationToMs(expiresIn) {
  if (!expiresIn) return 8 * 60 * 60 * 1000;
  if (typeof expiresIn === 'number') return expiresIn * 1000;
  const m = String(expiresIn).trim().match(/^(\d+)([smhd])$/i);
  if (!m) return 8 * 60 * 60 * 1000;
  const n = parseInt(m[1], 10);
  const u = m[2].toLowerCase();
  const mult = { s: 1000, m: 60 * 1000, h: 3600 * 1000, d: 86400 * 1000 };
  return n * (mult[u] || 3600 * 1000);
}

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function isCrossSiteRequest(req) {
  // Netlify (synaptasys.com) → Render (onrender.com) = toujours cross-site en prod
  if (process.env.AUTH_COOKIE_CROSS_SITE === 'true') return true;
  if (process.env.AUTH_COOKIE_CROSS_SITE === 'false') return false;
  if (isProduction()) return true;

  const origin = req?.headers?.origin;
  if (!origin) return false;
  try {
    const originHost = new URL(origin).hostname.replace(/^www\./, '');
    const apiHost = String(req.hostname || req.headers?.host || '')
      .split(':')[0]
      .replace(/^www\./, '');
    const localHosts = new Set(['localhost', '127.0.0.1']);
    if (localHosts.has(originHost) && localHosts.has(apiHost)) {
      return false;
    }
    return Boolean(apiHost) && originHost !== apiHost;
  } catch {
    return true;
  }
}

function cookieSameSite(req) {
  const forced = String(process.env.AUTH_COOKIE_SAMESITE || '').toLowerCase();
  if (forced === 'none' || forced === 'lax' || forced === 'strict') return forced;
  return isCrossSiteRequest(req) ? 'none' : 'lax';
}

function buildAuthCookieOptions(expiresIn, req) {
  const sameSite = cookieSameSite(req);
  // SameSite=None exige Secure ; en local same-site on reste en HTTP
  const secure =
    sameSite === 'none'
      ? true
      : process.env.AUTH_COOKIE_SECURE === 'true' || isProduction();

  const options = {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    maxAge: parseDurationToMs(expiresIn)
  };

  if (process.env.AUTH_COOKIE_DOMAIN) {
    options.domain = process.env.AUTH_COOKIE_DOMAIN;
  }

  return options;
}

function setAuthCookie(res, token, expiresIn, req) {
  res.cookie(AUTH_COOKIE_NAME, token, buildAuthCookieOptions(expiresIn, req));
}

function clearAuthCookie(res, req) {
  const options = buildAuthCookieOptions('1h', req);
  // clearCookie ignore maxAge ; garder sameSite/secure/path alignés
  delete options.maxAge;
  res.clearCookie(AUTH_COOKIE_NAME, options);
}

function extractTokenFromRequest(req) {
  const fromCookie = req.cookies?.[AUTH_COOKIE_NAME];
  if (fromCookie) return fromCookie;

  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (authHeader && String(authHeader).startsWith('Bearer ')) {
    return String(authHeader).slice(7).trim();
  }

  return null;
}

function extractTokenFromCookieHeader(cookieHeader) {
  if (!cookieHeader) return null;
  const parts = String(cookieHeader).split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (k === AUTH_COOKIE_NAME) {
      return decodeURIComponent(rest.join('=') || '');
    }
  }
  return null;
}

module.exports = {
  AUTH_COOKIE_NAME,
  setAuthCookie,
  clearAuthCookie,
  extractTokenFromRequest,
  extractTokenFromCookieHeader,
  parseDurationToMs,
  buildAuthCookieOptions,
  isCrossSiteRequest
};

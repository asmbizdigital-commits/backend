/**
 * JWT en cookie HttpOnly (anti-XSS) — cross-origin front/back via SameSite=None; Secure.
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

/** Cross-site (front ≠ API) → None+Secure ; sinon Lax en local même host. */
function cookieSameSite() {
  const forced = String(process.env.AUTH_COOKIE_SAMESITE || '').toLowerCase();
  if (forced === 'none' || forced === 'lax' || forced === 'strict') return forced;
  return isProduction() || process.env.AUTH_COOKIE_CROSS_SITE === 'true' ? 'none' : 'lax';
}

function buildAuthCookieOptions(expiresIn) {
  const sameSite = cookieSameSite();
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

function setAuthCookie(res, token, expiresIn) {
  res.cookie(AUTH_COOKIE_NAME, token, buildAuthCookieOptions(expiresIn));
}

function clearAuthCookie(res) {
  const sameSite = cookieSameSite();
  const secure =
    sameSite === 'none'
      ? true
      : process.env.AUTH_COOKIE_SECURE === 'true' || isProduction();
  const options = {
    httpOnly: true,
    secure,
    sameSite,
    path: '/'
  };
  if (process.env.AUTH_COOKIE_DOMAIN) {
    options.domain = process.env.AUTH_COOKIE_DOMAIN;
  }
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

/** Parse Cookie header (sockets) sans cookie-parser. */
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
  buildAuthCookieOptions
};

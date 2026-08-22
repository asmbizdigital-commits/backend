const crypto = require('crypto');

/**
 * Configuration des clés API tracking (systèmes tiers).
 *
 * Variable d'environnement TRACKING_API_KEYS (JSON) :
 * [
 *   {
 *     "client": "mon-erp",
 *     "label": "ERP partenaire",
 *     "key": "secret-long-aleatoire",
 *     "allowedIps": ["203.0.113.10"]   // optionnel
 *   }
 * ]
 *
 * Fallback : TRACKING_API_KEY=secret1,secret2
 * Labels optionnels : TRACKING_API_KEY_CLIENTS=erp1,erp2 (même ordre)
 */

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function parseJsonKeys(raw) {
  if (!raw || !String(raw).trim()) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => ({
        client: String(entry.client || entry.id || entry.name || 'client').trim() || 'client',
        label: String(entry.label || entry.client || entry.id || 'Client API').trim(),
        key: String(entry.key || '').trim(),
        allowedIps: Array.isArray(entry.allowedIps)
          ? entry.allowedIps.map((ip) => String(ip).trim()).filter(Boolean)
          : []
      }))
      .filter((entry) => entry.key.length >= 16);
  } catch {
    return [];
  }
}

function parseLegacyKeys() {
  const keysRaw = String(process.env.TRACKING_API_KEY || '').trim();
  if (!keysRaw) return [];
  const keys = keysRaw.split(',').map((k) => k.trim()).filter((k) => k.length >= 16);
  const clientsRaw = String(process.env.TRACKING_API_KEY_CLIENTS || '').trim();
  const clients = clientsRaw
    ? clientsRaw.split(',').map((c) => c.trim())
    : keys.map((_, i) => `client-${i + 1}`);
  return keys.map((key, i) => ({
    client: clients[i] || `client-${i + 1}`,
    label: clients[i] || `Client ${i + 1}`,
    key,
    allowedIps: []
  }));
}

function loadTrackingApiKeyEntries() {
  const fromJson = parseJsonKeys(process.env.TRACKING_API_KEYS);
  if (fromJson.length) return fromJson;
  return parseLegacyKeys();
}

function isTrackingApiEnabled() {
  if (String(process.env.TRACKING_API_ENABLED || 'true').toLowerCase() === 'false') {
    return false;
  }
  return loadTrackingApiKeyEntries().length > 0;
}

function maskKey(key) {
  if (!key || key.length < 8) return '****';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function resolveClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = String(forwarded).split(',')[0].trim();
    if (first) return first;
  }
  return req.ip || req.connection?.remoteAddress || '';
}

function ipAllowed(clientIp, allowedIps) {
  if (!allowedIps || allowedIps.length === 0) return true;
  if (!clientIp) return false;
  return allowedIps.some((allowed) => clientIp === allowed || clientIp.endsWith(allowed));
}

/**
 * @returns {{ client: string, label: string, key: string, allowedIps: string[] } | null}
 */
function validateTrackingApiKey(providedKey, req = null) {
  const key = String(providedKey || '').trim();
  if (!key) return null;
  const entries = loadTrackingApiKeyEntries();
  for (const entry of entries) {
    if (timingSafeEqual(key, entry.key)) {
      if (req && !ipAllowed(resolveClientIp(req), entry.allowedIps)) {
        return null;
      }
      return entry;
    }
  }
  return null;
}

function extractTrackingApiKeyFromRequest(req) {
  const dedicated = req.headers['x-tracking-api-key'] || req.headers['x-api-key'];
  if (dedicated && String(dedicated).trim()) {
    return String(dedicated).trim();
  }
  const auth = req.headers.authorization;
  if (auth && String(auth).toLowerCase().startsWith('bearer ')) {
    const token = String(auth.slice(7)).trim();
    // JWT (3 segments) → laisser authenticateToken gérer Authorization
    if (token.split('.').length === 3) return null;
    return token;
  }
  return null;
}

function getTrackingIntegrationPublicConfig(req) {
  const baseUrl = String(process.env.TRACKING_API_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  const inferredBase = baseUrl || `${req.protocol}://${req.get('host')}/api/tracking-dossier`;
  const entries = loadTrackingApiKeyEntries();

  return {
    enabled: isTrackingApiEnabled(),
    baseUrl: inferredBase,
    authHeader: 'X-Tracking-Api-Key',
    alternateAuth: 'Authorization: Bearer <clé>',
    rateLimitPer15Min: parseInt(String(process.env.TRACKING_API_RATE_LIMIT || '120'), 10) || 120,
    clients: entries.map((e) => ({
      client: e.client,
      label: e.label,
      keyPreview: maskKey(e.key),
      ipRestricted: e.allowedIps.length > 0,
      allowedIpsCount: e.allowedIps.length
    }))
  };
}

module.exports = {
  loadTrackingApiKeyEntries,
  isTrackingApiEnabled,
  validateTrackingApiKey,
  extractTrackingApiKeyFromRequest,
  getTrackingIntegrationPublicConfig,
  maskKey,
  resolveClientIp
};

/**
 * Cache mémoire TTL pour réponses API lourdes ou peu volatiles.
 */
const stores = new Map();

function getCached(key) {
  const entry = stores.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    stores.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key, value, ttlMs) {
  stores.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
}

function invalidateCache(keyPrefix) {
  if (!keyPrefix) {
    stores.clear();
    return;
  }
  for (const key of stores.keys()) {
    if (key.startsWith(keyPrefix)) stores.delete(key);
  }
}

module.exports = {
  getCached,
  setCached,
  invalidateCache
};

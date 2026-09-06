const rateLimit = require('express-rate-limit');
const { authenticateToken } = require('./auth');
const {
  validateTrackingApiKey,
  extractTrackingApiKeyFromRequest,
  isTrackingApiEnabled
} = require('../utils/trackingApiKeys');

function rateLimitWithCors(req, res) {
  res.status(429).json({
    success: false,
    message: 'Limite de requêtes API tracking atteinte. Réessayez plus tard.'
  });
}

/** Limite dédiée aux appels par clé API (par clé, fenêtre 15 min). */
const trackingApiKeyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(String(process.env.TRACKING_API_RATE_LIMIT || '120'), 10) || 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitWithCors,
  keyGenerator: (req) => {
    const client = req.trackingApiClient?.client;
    if (client) return `tracking-api:${client}`;
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    return `tracking-api-ip:${ip}`;
  },
  skip: (req) => req.authMode !== 'api_key'
});

/**
 * Accès tracking : clé API tierce OU JWT Administrateur.
 */
function authenticateTrackingAccess(req, res, next) {
  const apiKey = extractTrackingApiKeyFromRequest(req);

  if (apiKey) {
    if (!isTrackingApiEnabled()) {
      return res.status(503).json({
        success: false,
        message: 'API tracking tierce non configurée sur ce serveur.'
      });
    }
    const client = validateTrackingApiKey(apiKey, req);
    if (!client) {
      return res.status(401).json({
        success: false,
        message: 'Clé API tracking invalide ou adresse IP non autorisée.'
      });
    }
    req.trackingApiClient = { client: client.client, label: client.label };
    req.authMode = 'api_key';
    req.user = req.user || {
      id: null,
      role: 'TrackingApiClient',
      nom: client.client,
      prenom: client.label
    };
    return next();
  }

  return authenticateToken(req, res, () => {
    if (req.user?.role !== 'Administrateur') {
      return res.status(403).json({
        success: false,
        message: 'Accès réservé aux Administrateurs ou aux systèmes tiers autorisés.'
      });
    }
    req.authMode = 'jwt';
    return next();
  });
}

/** Infos d'intégration : Administrateur JWT uniquement (pas de clé API). */
function requireTrackingAdminJwt(req, res, next) {
  if (req.authMode === 'api_key') {
    return res.status(403).json({
      success: false,
      message: 'Endpoint réservé à l’administration (JWT).'
    });
  }
  if (req.user?.role === 'Administrateur') {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Accès administrateur requis.' });
}

module.exports = {
  authenticateTrackingAccess,
  requireTrackingAdminJwt,
  trackingApiKeyLimiter
};

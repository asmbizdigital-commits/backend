const express = require('express');
const { query, param, validationResult } = require('express-validator');
const {
  authenticateTrackingAccess,
  requireTrackingAdminJwt,
  trackingApiKeyLimiter
} = require('../middleware/trackingApiAuth');
const {
  searchTrackingDossiers,
  loadTrackingDossierById
} = require('../services/trackingDossierService');
const { getTrackingIntegrationPublicConfig } = require('../utils/trackingApiKeys');

const router = express.Router();

router.use(authenticateTrackingAccess);
router.use(trackingApiKeyLimiter);

/** GET /api/tracking-dossier/integration — config & doc (admin JWT). */
router.get('/integration', requireTrackingAdminJwt, (req, res) => {
  const config = getTrackingIntegrationPublicConfig(req);
  return res.json({
    success: true,
    integration: {
      ...config,
      endpoints: [
        {
          method: 'GET',
          path: '/api/tracking-dossier/search',
          description: 'Recherche par N° dossier, B/L ou N° déclaration.',
          query: { q: 'string (requis)', limit: 'integer 1-50 (optionnel, défaut 25)' }
        },
        {
          method: 'GET',
          path: '/api/tracking-dossier/:id',
          description: 'Dossier complet (circuit, assignations, documents, activité, fiche ASM).',
          params: { id: 'integer connaissement_id' }
        },
        {
          method: 'GET',
          path: '/api/tracking-dossier/health',
          description: 'Vérification de la clé API et disponibilité du service.'
        }
      ],
      documentationPath: '/docs/TRACKING_DOSSIER_API.md'
    }
  });
});

/** GET /api/tracking-dossier/health — ping authentifié (JWT ou clé API). */
router.get('/health', (req, res) => {
  return res.json({
    success: true,
    service: 'tracking-dossier',
    authMode: req.authMode || 'unknown',
    client: req.trackingApiClient?.client || null,
    at: new Date().toISOString()
  });
});

/**
 * GET /api/tracking-dossier/search?q=...
 * Recherche par N° dossier, B/L ou N° déclaration.
 */
router.get(
  '/search',
  [query('q').isString().trim().notEmpty(), query('limit').optional().isInt({ min: 1, max: 50 })],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Paramètre de recherche requis (N° dossier, B/L ou N° déclaration).',
          errors: errors.array()
        });
      }

      const q = String(req.query.q || '').trim();
      const limit = parseInt(String(req.query.limit || 25), 10) || 25;
      const results = await searchTrackingDossiers(q, { limit });

      let dossier = null;
      if (results.length === 1) {
        dossier = await loadTrackingDossierById(results[0].id);
      }

      return res.json({
        success: true,
        query: q,
        count: results.length,
        results,
        dossier
      });
    } catch (error) {
      console.error('GET /api/tracking-dossier/search', error);
      return res.status(500).json({
        success: false,
        message: 'Erreur lors de la recherche du dossier.'
      });
    }
  }
);

/**
 * GET /api/tracking-dossier/:id
 * Dossier complet avec circuit, jointures et journal d’activité.
 */
router.get('/:id', [param('id').isInt({ min: 1 })], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const dossier = await loadTrackingDossierById(req.params.id);
    if (!dossier) {
      return res.status(404).json({ success: false, message: 'Dossier introuvable.' });
    }

    return res.json({ success: true, dossier });
  } catch (error) {
    console.error('GET /api/tracking-dossier/:id', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors du chargement du dossier.'
    });
  }
});

module.exports = router;

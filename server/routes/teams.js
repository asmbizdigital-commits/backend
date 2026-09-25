/**
 * Routes Microsoft Teams — OAuth + réunions.
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const teamsService = require('../services/teamsService');
const { TeamsGraphError } = require('../services/microsoftGraphService');
const { getMicrosoftConfig } = require('../config/microsoft');

const router = express.Router();

function sendTeamsError(res, error) {
  if (error instanceof TeamsGraphError) {
    return res.status(error.status || 400).json({
      success: false,
      code: error.code,
      message: error.message,
      details: error.details || undefined
    });
  }
  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    return res.status(400).json({
      success: false,
      code: 'TEAMS_INVALID_STATE',
      message: 'État OAuth invalide ou expiré. Réessayez la connexion.'
    });
  }
  console.error('Teams route error:', error.message);
  return res.status(500).json({
    success: false,
    code: 'TEAMS_INTERNAL_ERROR',
    message: 'Erreur lors de l’opération Teams.'
  });
}

/** Statut connexion (auth app requise) */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const data = await teamsService.getStatus(req.user.id);
    return res.json({ success: true, data });
  } catch (e) {
    return sendTeamsError(res, e);
  }
});

/** URL d’autorisation Microsoft */
router.get('/auth', authenticateToken, async (req, res) => {
  try {
    const data = await teamsService.getAuthUrl(req.user.id);
    return res.json({ success: true, data });
  } catch (e) {
    return sendTeamsError(res, e);
  }
});

/**
 * Callback OAuth Microsoft (pas de JWT app — state signé).
 * Redirige vers le frontend.
 */
router.get('/auth/callback', async (req, res) => {
  const cfg = getMicrosoftConfig();
  const front = cfg.frontendUrl.replace(/\/$/, '');
  try {
    const { code, state, error, error_description: errDesc } = req.query;
    if (error) {
      const q = new URLSearchParams({
        teams: 'error',
        message: String(errDesc || error).slice(0, 200)
      });
      return res.redirect(`${front}/teams?${q}`);
    }
    if (!code || !state) {
      return res.redirect(`${front}/teams?teams=error&message=missing_code`);
    }
    const result = await teamsService.handleOAuthCallback(String(code), String(state));
    return res.redirect(result.redirectTo);
  } catch (e) {
    console.error('Teams OAuth callback:', e.message);
    const q = new URLSearchParams({
      teams: 'error',
      message: (e.message || 'oauth_failed').slice(0, 200)
    });
    return res.redirect(`${front}/teams?${q}`);
  }
});

router.post('/disconnect', authenticateToken, async (req, res) => {
  try {
    await teamsService.disconnect(req.user.id);
    return res.json({ success: true, message: 'Compte Microsoft Teams déconnecté.' });
  } catch (e) {
    return sendTeamsError(res, e);
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const { getCurrentMicrosoftUser } = require('../services/microsoftGraphService');
    const { me, account } = await getCurrentMicrosoftUser(req.user.id);
    return res.json({
      success: true,
      data: {
        id: me.id,
        displayName: me.displayName,
        email: me.mail || me.userPrincipalName,
        connectedAt: account.connectedAt
      }
    });
  } catch (e) {
    return sendTeamsError(res, e);
  }
});

router.get('/meetings', authenticateToken, async (req, res) => {
  try {
    const data = await teamsService.listMeetings(req.user.id, {
      from: req.query.from,
      to: req.query.to,
      status: req.query.status
    });
    return res.json({ success: true, data });
  } catch (e) {
    return sendTeamsError(res, e);
  }
});

router.post(
  '/meetings',
  authenticateToken,
  express.json({ limit: '256kb' }),
  [
    body('subject').isString().trim().isLength({ min: 1, max: 255 }),
    body('startAt').isISO8601(),
    body('endAt').isISO8601(),
    body('timezone').optional().isString().isLength({ max: 100 }),
    body('description').optional().isString().isLength({ max: 5000 }),
    body('participants').optional().isArray({ max: 50 }),
    body('participants.*.email').optional().isEmail(),
    body('referenceType').optional().isString().isLength({ max: 100 }),
    body('referenceId').optional().isInt({ min: 1 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION',
          message: 'Données de réunion invalides.',
          errors: errors.array()
        });
      }
      const data = await teamsService.createMeeting(req.user.id, req.body);
      return res.status(201).json({ success: true, data });
    } catch (e) {
      return sendTeamsError(res, e);
    }
  }
);

router.get('/meetings/:id', authenticateToken, async (req, res) => {
  try {
    const data = await teamsService.getMeeting(req.user.id, parseInt(req.params.id, 10));
    return res.json({ success: true, data });
  } catch (e) {
    return sendTeamsError(res, e);
  }
});

router.delete('/meetings/:id', authenticateToken, async (req, res) => {
  try {
    const data = await teamsService.cancelMeeting(req.user.id, parseInt(req.params.id, 10));
    return res.json({ success: true, data });
  } catch (e) {
    return sendTeamsError(res, e);
  }
});

module.exports = router;

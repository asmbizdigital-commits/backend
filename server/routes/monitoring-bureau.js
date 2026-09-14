const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requireMonitoringBureauAccess } = require('../utils/monitoringBureauAccess');
const {
  isManagerBureauRole,
  isRoleAdministrateur
} = require('../utils/userRoles');
const { buildMonitoringTodayPayload } = require('../services/monitoringToday');

const router = express.Router();
router.use(authenticateToken);
router.use(requireMonitoringBureauAccess);

/**
 * GET /api/monitoring-bureau/today
 * Manager Bureau : forcé sur son bureau international.
 * Administrateur : tous les bureaux, ou filtre optionnel ?bureau_id=
 */
router.get('/today', async (req, res) => {
  try {
    let bureauId = null;

    if (isManagerBureauRole(req.user?.role)) {
      bureauId = Number(
        req.user.bureau_international_id ??
          req.user.bureauInternationalId ??
          null
      );
      if (!Number.isFinite(bureauId) || bureauId < 1) {
        return res.status(400).json({
          success: false,
          message:
            'Aucun bureau international n’est rattaché à votre compte. Demandez à un administrateur de le renseigner.'
        });
      }
    } else if (isRoleAdministrateur(req.user?.role)) {
      const raw = parseInt(String(req.query.bureau_id || ''), 10);
      if (Number.isFinite(raw) && raw > 0) bureauId = raw;
    }

    const payload = await buildMonitoringTodayPayload({
      date: req.query.date ? String(req.query.date) : undefined,
      bureauId
    });
    res.json(payload);
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error('GET /api/monitoring-bureau/today', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du chargement du Monitoring Bureau.'
    });
  }
});

module.exports = router;

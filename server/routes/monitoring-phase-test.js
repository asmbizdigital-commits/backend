const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requireMonitoringPhaseTestAccess } = require('../utils/monitoringPhaseTestAccess');
const { buildMonitoringTodayPayload } = require('../services/monitoringToday');

const router = express.Router();
router.use(authenticateToken);
router.use(requireMonitoringPhaseTestAccess);

/**
 * GET /api/monitoring-phase-test/today
 */
router.get('/today', async (req, res) => {
  try {
    const payload = await buildMonitoringTodayPayload({
      date: req.query.date ? String(req.query.date) : undefined
    });
    res.json(payload);
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error('GET /api/monitoring-phase-test/today', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du chargement du monitoring.'
    });
  }
});

module.exports = router;

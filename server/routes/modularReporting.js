/**
 * API Reporting modulaire V1 — Patron / Administrateur uniquement.
 */
const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const reporting = require('../services/modularReportingService');
const controleurKpi = require('../services/controleurKpiService');

const router = express.Router();

router.use(authenticateToken);
router.use(requireRole(['Patron', 'Administrateur']));

router.get('/datasets', (req, res) => {
  return res.json({ success: true, data: reporting.listDatasets() });
});

router.post('/query', express.json({ limit: '64kb' }), async (req, res) => {
  try {
    const data = await reporting.runPivotQuery(req.body || {});
    return res.json({ success: true, data });
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({
      success: false,
      code: e.code || 'QUERY_FAILED',
      message: e.message || 'Échec de la requête reporting.'
    });
  }
});

router.post('/suggest', express.json({ limit: '32kb' }), (req, res) => {
  try {
    const plan = reporting.suggestPlanFromPrompt(
      req.body?.prompt,
      req.body?.dataset
    );
    return res.json({ success: true, data: plan });
  } catch (e) {
    return res.status(500).json({
      success: false,
      message: e.message || 'Suggestion impossible.'
    });
  }
});

/** Liste des contrôleurs Sygrem / Sygram */
router.get('/controleur-kpi/controleurs', async (req, res) => {
  try {
    const data = await controleurKpi.listControleurs();
    return res.json({ success: true, data });
  } catch (e) {
    return res.status(500).json({
      success: false,
      message: e.message || 'Impossible de lister les contrôleurs.'
    });
  }
});

/** Stats productivité pour préremplir la fiche KPI */
router.get('/controleur-kpi/stats', async (req, res) => {
  try {
    const data = await controleurKpi.getControleurProductivityStats({
      userId: req.query.user_id,
      dateFrom: req.query.date_from,
      dateTo: req.query.date_to
    });
    return res.json({ success: true, data });
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({
      success: false,
      message: e.message || 'Impossible de charger les stats contrôleur.'
    });
  }
});

module.exports = router;

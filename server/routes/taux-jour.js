const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const TauxJour = require('../models/TauxJour');

const DEVISES = ['USD', 'EUR', 'GBP', 'CNY', 'JPY'];

const router = express.Router();
router.use(authenticateToken);

// GET /api/taux-jour?date=YYYY-MM-DD — récupère les taux pour une date (défaut: aujourd'hui)
router.get('/', [
  query('date').optional().isDate().withMessage('Date invalide (YYYY-MM-DD)')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const rows = await TauxJour.findAll({
      where: { date },
      order: [['devise', 'ASC']],
      raw: true
    });
    const rates = {};
    DEVISES.forEach(d => { rates[d] = null; });
    rows.forEach(r => { rates[r.devise] = parseFloat(r.taux); });
    return res.json({ date, rates });
  } catch (err) {
    console.error('Taux-jour GET:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/taux-jour — enregistre ou met à jour les taux pour une date (body: { date, rates: { USD: 2200, EUR: 3200, ... } })
router.put('/', [
  body('date').isDate().withMessage('Date invalide (YYYY-MM-DD)'),
  body('rates').isObject().withMessage('rates requis (objet devise => taux)'),
  body('rates.USD').optional().isFloat({ min: 0 }).withMessage('USD doit être un nombre positif'),
  body('rates.EUR').optional().isFloat({ min: 0 }).withMessage('EUR doit être un nombre positif'),
  body('rates.GBP').optional().isFloat({ min: 0 }).withMessage('GBP doit être un nombre positif'),
  body('rates.CNY').optional().isFloat({ min: 0 }).withMessage('CNY doit être un nombre positif'),
  body('rates.JPY').optional().isFloat({ min: 0 }).withMessage('JPY doit être un nombre positif')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    const { date, rates } = req.body;
    for (const devise of DEVISES) {
      const valeur = rates[devise];
      if (valeur == null || valeur === '') continue;
      const taux = parseFloat(valeur);
      if (isNaN(taux) || taux < 0) continue;
      await TauxJour.upsert({ date, devise, taux });
    }
    const updated = await TauxJour.findAll({
      where: { date },
      order: [['devise', 'ASC']],
      raw: true
    });
    const out = { date, rates: {} };
    DEVISES.forEach(d => { out.rates[d] = null; });
    updated.forEach(r => { out.rates[r.devise] = parseFloat(r.taux); });
    return res.json(out);
  } catch (err) {
    console.error('Taux-jour PUT:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;

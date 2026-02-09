const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const sequelize = require('sequelize');
const RedevanceMine = require('../models/RedevanceMine');
const PaiementRedevance = require('../models/PaiementRedevance');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/mines/redevances - Liste avec filtres
router.get('/', [
  query('statut').optional().isIn(['due', 'partiellement_payee', 'payee', 'en_retard']),
  query('operateur').optional().isString(),
  query('periode').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', errors: errors.array() });
    }
    const { statut, operateur, periode, page = 1, limit = 20 } = req.query;
    const where = {};
    if (statut) where.statut = statut;
    if (operateur && operateur.trim()) where.operateur_nom = { [Op.like]: `%${operateur.trim()}%` };
    if (periode && periode.trim()) where.periode = { [Op.like]: `%${periode.trim()}%` };

    const { count, rows } = await RedevanceMine.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['date_echeance', 'ASC'], ['created_at', 'DESC']]
    });

    res.json({
      data: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('List redevances error:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des redevances' });
  }
});

// GET /api/mines/redevances/stats - Statistiques rapides
router.get('/stats', async (req, res) => {
  try {
    const [totalDue, totalPayee, byStatut] = await Promise.all([
      RedevanceMine.sum('montant_due', { where: {} }),
      RedevanceMine.sum('montant_paye', { where: {} }),
      RedevanceMine.findAll({
        attributes: ['statut', [sequelize.fn('COUNT', '*'), 'count']],
        group: ['statut'],
        raw: true
      })
    ]);
    const stats = { totalDue: parseFloat(totalDue || 0), totalPayee: parseFloat(totalPayee || 0), byStatut: {} };
    byStatut.forEach(({ statut, count }) => { stats.byStatut[statut] = parseInt(count); });
    res.json({ data: stats });
  } catch (err) {
    console.error('Stats redevances error:', err);
    res.status(500).json({ error: 'Erreur statistiques' });
  }
});

// GET /api/mines/redevances/:id - Détail + paiements
router.get('/:id', param('id').isInt(), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const redevance = await RedevanceMine.findByPk(req.params.id, {
      include: [{ model: PaiementRedevance, as: 'paiements', order: [['date_paiement', 'DESC']] }]
    });
    if (!redevance) return res.status(404).json({ error: 'Redevance non trouvée' });
    res.json({ data: redevance });
  } catch (err) {
    console.error('Get redevance error:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération' });
  }
});

// POST /api/mines/redevances - Créer
router.post('/', [
  body('operateur_nom').trim().notEmpty().withMessage('Opérateur requis'),
  body('type_redevance').optional().isIn(['redevance_miniere', 'superficiaire', 'autre']),
  body('periode').trim().notEmpty().withMessage('Période requise'),
  body('montant_due').isFloat({ min: 0 }).withMessage('Montant invalide'),
  body('devise').optional().isString().isLength({ max: 5 }),
  body('date_echeance').optional().isISO8601().toDate(),
  body('reference').optional().isString().isLength({ max: 100 }),
  body('notes').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', errors: errors.array() });
    }
    const payload = {
      operateur_nom: req.body.operateur_nom.trim(),
      type_redevance: req.body.type_redevance || 'redevance_miniere',
      periode: req.body.periode.trim(),
      montant_due: parseFloat(req.body.montant_due),
      devise: (req.body.devise || 'USD').substring(0, 5),
      date_echeance: req.body.date_echeance || null,
      montant_paye: 0,
      statut: 'due',
      reference: req.body.reference?.trim() || null,
      notes: req.body.notes?.trim() || null
    };
    const redevance = await RedevanceMine.create(payload);
    res.status(201).json({ data: redevance });
  } catch (err) {
    console.error('Create redevance error:', err);
    res.status(500).json({ error: 'Erreur lors de la création' });
  }
});

// PUT /api/mines/redevances/:id - Modifier
router.put('/:id', [
  param('id').isInt(),
  body('operateur_nom').optional().trim().notEmpty(),
  body('type_redevance').optional().isIn(['redevance_miniere', 'superficiaire', 'autre']),
  body('periode').optional().trim().notEmpty(),
  body('montant_due').optional().isFloat({ min: 0 }),
  body('devise').optional().isString().isLength({ max: 5 }),
  body('date_echeance').optional().isISO8601().toDate(),
  body('reference').optional().isString().isLength({ max: 100 }),
  body('notes').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', errors: errors.array() });
    }
    const redevance = await RedevanceMine.findByPk(req.params.id);
    if (!redevance) return res.status(404).json({ error: 'Redevance non trouvée' });
    const updates = {};
    if (req.body.operateur_nom !== undefined) updates.operateur_nom = req.body.operateur_nom.trim();
    if (req.body.type_redevance !== undefined) updates.type_redevance = req.body.type_redevance;
    if (req.body.periode !== undefined) updates.periode = req.body.periode.trim();
    if (req.body.montant_due !== undefined) updates.montant_due = parseFloat(req.body.montant_due);
    if (req.body.devise !== undefined) updates.devise = req.body.devise.substring(0, 5);
    if (req.body.date_echeance !== undefined) updates.date_echeance = req.body.date_echeance || null;
    if (req.body.reference !== undefined) updates.reference = req.body.reference?.trim() || null;
    if (req.body.notes !== undefined) updates.notes = req.body.notes?.trim() || null;
    await redevance.update(updates);
    res.json({ data: redevance });
  } catch (err) {
    console.error('Update redevance error:', err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
});

// DELETE /api/mines/redevances/:id
router.delete('/:id', param('id').isInt(), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid id' });
    const redevance = await RedevanceMine.findByPk(req.params.id);
    if (!redevance) return res.status(404).json({ error: 'Redevance non trouvée' });
    await redevance.destroy();
    res.json({ message: 'Redevance supprimée' });
  } catch (err) {
    console.error('Delete redevance error:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

// POST /api/mines/redevances/:id/paiements - Enregistrer un paiement
router.post('/:id/paiements', [
  param('id').isInt(),
  body('date_paiement').notEmpty().withMessage('Date requise'),
  body('montant').isFloat({ min: 0.01 }).withMessage('Montant invalide'),
  body('devise').optional().isString().isLength({ max: 5 }),
  body('reference_paiement').optional().isString().isLength({ max: 100 }),
  body('mode_paiement').optional().isString().isLength({ max: 50 }),
  body('notes').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', errors: errors.array() });
    }
    const redevance = await RedevanceMine.findByPk(req.params.id);
    if (!redevance) return res.status(404).json({ error: 'Redevance non trouvée' });
    const montant = parseFloat(req.body.montant);
    const devise = (req.body.devise || redevance.devise).substring(0, 5);
    const paiement = await PaiementRedevance.create({
      redevance_id: redevance.id,
      date_paiement: req.body.date_paiement,
      montant,
      devise,
      reference_paiement: req.body.reference_paiement?.trim() || null,
      mode_paiement: req.body.mode_paiement?.trim() || null,
      notes: req.body.notes?.trim() || null
    });
    const newMontantPaye = parseFloat(redevance.montant_paye) + montant;
    const montantDue = parseFloat(redevance.montant_due);
    let statut = 'due';
    if (newMontantPaye >= montantDue) statut = 'payee';
    else if (newMontantPaye > 0) statut = 'partiellement_payee';
    await redevance.update({ montant_paye: newMontantPaye, statut });
    const updated = await RedevanceMine.findByPk(redevance.id, {
      include: [{ model: PaiementRedevance, as: 'paiements' }]
    });
    res.status(201).json({ data: { paiement, redevance: updated } });
  } catch (err) {
    console.error('Add paiement error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'enregistrement du paiement' });
  }
});

// DELETE /api/mines/redevances/paiements/:paiementId - Supprimer un paiement
router.delete('/paiements/:paiementId', param('paiementId').isInt(), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid id' });
    const paiement = await PaiementRedevance.findByPk(req.params.paiementId);
    if (!paiement) return res.status(404).json({ error: 'Paiement non trouvé' });
    const redevance = await RedevanceMine.findByPk(paiement.redevance_id);
    if (!redevance) return res.status(404).json({ error: 'Redevance non trouvée' });
    const newMontantPaye = Math.max(0, parseFloat(redevance.montant_paye) - parseFloat(paiement.montant));
    const montantDue = parseFloat(redevance.montant_due);
    let statut = 'due';
    if (newMontantPaye >= montantDue) statut = 'payee';
    else if (newMontantPaye > 0) statut = 'partiellement_payee';
    await paiement.destroy();
    await redevance.update({ montant_paye: newMontantPaye, statut });
    const updated = await RedevanceMine.findByPk(redevance.id, {
      include: [{ model: PaiementRedevance, as: 'paiements' }]
    });
    res.json({ data: { redevance: updated } });
  } catch (err) {
    console.error('Delete paiement error:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression du paiement' });
  }
});

module.exports = router;

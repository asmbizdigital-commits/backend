const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const TitrePermisMine = require('../models/TitrePermisMine');
const OperateurMine = require('../models/OperateurMine');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/mines/titres-permis - Liste avec filtres
router.get('/', [
  query('statut').optional().isIn(['actif', 'expire', 'suspendu', 'en_renouvellement']),
  query('type_titre').optional().isIn(['permis_recherche', 'permis_exploitation', 'concession_miniere', 'autorisation_artisanale', 'autre']),
  query('operateur_id').optional().isInt(),
  query('search').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', errors: errors.array() });
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const { statut, type_titre, operateur_id, search } = req.query;
    const where = {};
    if (statut) where.statut = statut;
    if (type_titre) where.type_titre = type_titre;
    if (operateur_id) where.operateur_id = parseInt(operateur_id, 10);
    if (search && search.trim()) {
      where[Op.or] = [
        { numero_titre: { [Op.like]: `%${search.trim()}%` } },
        { zone: { [Op.like]: `%${search.trim()}%` } }
      ];
    }

    const { count, rows } = await TitrePermisMine.findAndCountAll({
      where,
      include: [{ model: OperateurMine, as: 'operateur', attributes: ['id', 'raison_sociale', 'sigle'] }],
      limit,
      offset: (page - 1) * limit,
      order: [['date_expiration', 'ASC'], ['numero_titre', 'ASC']]
    });

    res.json({
      data: rows,
      pagination: { page, limit, total: count, pages: Math.ceil(count / limit) }
    });
  } catch (err) {
    console.error('List titres-permis error:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des titres et permis' });
  }
});

// GET /api/mines/titres-permis/:id
router.get('/:id', param('id').isInt(), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid id' });
    const titre = await TitrePermisMine.findByPk(req.params.id, {
      include: [{ model: OperateurMine, as: 'operateur' }]
    });
    if (!titre) return res.status(404).json({ error: 'Titre / permis non trouvé' });
    res.json({ data: titre });
  } catch (err) {
    console.error('Get titre-permis error:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération' });
  }
});

// POST /api/mines/titres-permis
router.post('/', [
  body('operateur_id').isInt().withMessage('Opérateur requis'),
  body('numero_titre').trim().notEmpty().withMessage('Numéro du titre requis'),
  body('type_titre').optional().isIn(['permis_recherche', 'permis_exploitation', 'concession_miniere', 'autorisation_artisanale', 'autre']),
  body('date_delivrance').optional().isISO8601().toDate(),
  body('date_expiration').optional().isISO8601().toDate(),
  body('superficie_ha').optional().isFloat({ min: 0 }),
  body('zone').optional().isString().isLength({ max: 150 }),
  body('statut').optional().isIn(['actif', 'expire', 'suspendu', 'en_renouvellement']),
  body('notes').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', errors: errors.array() });
    }
    const payload = {
      operateur_id: parseInt(req.body.operateur_id, 10),
      numero_titre: req.body.numero_titre.trim(),
      type_titre: req.body.type_titre || 'permis_recherche',
      date_delivrance: req.body.date_delivrance || null,
      date_expiration: req.body.date_expiration || null,
      superficie_ha: req.body.superficie_ha != null ? parseFloat(req.body.superficie_ha) : null,
      zone: req.body.zone?.trim() || null,
      statut: req.body.statut || 'actif',
      notes: req.body.notes?.trim() || null
    };
    const titre = await TitrePermisMine.create(payload);
    const withOperateur = await TitrePermisMine.findByPk(titre.id, {
      include: [{ model: OperateurMine, as: 'operateur', attributes: ['id', 'raison_sociale', 'sigle'] }]
    });
    res.status(201).json({ data: withOperateur });
  } catch (err) {
    console.error('Create titre-permis error:', err);
    res.status(500).json({ error: 'Erreur lors de la création' });
  }
});

// PUT /api/mines/titres-permis/:id
router.put('/:id', [
  param('id').isInt(),
  body('operateur_id').optional().isInt(),
  body('numero_titre').optional().trim().notEmpty(),
  body('type_titre').optional().isIn(['permis_recherche', 'permis_exploitation', 'concession_miniere', 'autorisation_artisanale', 'autre']),
  body('date_delivrance').optional().isISO8601().toDate(),
  body('date_expiration').optional().isISO8601().toDate(),
  body('superficie_ha').optional().isFloat({ min: 0 }),
  body('zone').optional().isString().isLength({ max: 150 }),
  body('statut').optional().isIn(['actif', 'expire', 'suspendu', 'en_renouvellement']),
  body('notes').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', errors: errors.array() });
    }
    const titre = await TitrePermisMine.findByPk(req.params.id);
    if (!titre) return res.status(404).json({ error: 'Titre / permis non trouvé' });
    const updates = {};
    if (req.body.operateur_id !== undefined) updates.operateur_id = parseInt(req.body.operateur_id, 10);
    if (req.body.numero_titre !== undefined) updates.numero_titre = req.body.numero_titre.trim();
    if (req.body.type_titre !== undefined) updates.type_titre = req.body.type_titre;
    if (req.body.date_delivrance !== undefined) updates.date_delivrance = req.body.date_delivrance || null;
    if (req.body.date_expiration !== undefined) updates.date_expiration = req.body.date_expiration || null;
    if (req.body.superficie_ha !== undefined) updates.superficie_ha = req.body.superficie_ha != null ? parseFloat(req.body.superficie_ha) : null;
    if (req.body.zone !== undefined) updates.zone = req.body.zone?.trim() || null;
    if (req.body.statut !== undefined) updates.statut = req.body.statut;
    if (req.body.notes !== undefined) updates.notes = req.body.notes?.trim() || null;
    await titre.update(updates);
    const withOperateur = await TitrePermisMine.findByPk(titre.id, {
      include: [{ model: OperateurMine, as: 'operateur', attributes: ['id', 'raison_sociale', 'sigle'] }]
    });
    res.json({ data: withOperateur });
  } catch (err) {
    console.error('Update titre-permis error:', err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
});

// DELETE /api/mines/titres-permis/:id
router.delete('/:id', param('id').isInt(), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid id' });
    const titre = await TitrePermisMine.findByPk(req.params.id);
    if (!titre) return res.status(404).json({ error: 'Titre / permis non trouvé' });
    await titre.destroy();
    res.json({ message: 'Titre / permis supprimé' });
  } catch (err) {
    console.error('Delete titre-permis error:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

module.exports = router;

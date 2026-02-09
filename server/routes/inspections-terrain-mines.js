const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const InspectionTerrainMine = require('../models/InspectionTerrainMine');
const OperateurMine = require('../models/OperateurMine');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/mines/inspections-terrain
router.get('/', [
  query('statut').optional().isIn(['planifiee', 'en_cours', 'terminee', 'reportee', 'annulee']),
  query('type_inspection').optional().isIn(['routine', 'ciblee', 'suite_plainte', 'autre']),
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
    const { statut, type_inspection, operateur_id, search } = req.query;
    const where = {};
    if (statut) where.statut = statut;
    if (type_inspection) where.type_inspection = type_inspection;
    if (operateur_id) where.operateur_id = parseInt(operateur_id, 10);
    if (search && search.trim()) {
      where[Op.or] = [
        { numero_mission: { [Op.like]: `%${search.trim()}%` } },
        { titre: { [Op.like]: `%${search.trim()}%` } },
        { zone_site: { [Op.like]: `%${search.trim()}%` } },
        { inspecteur_nom: { [Op.like]: `%${search.trim()}%` } }
      ];
    }

    const { count, rows } = await InspectionTerrainMine.findAndCountAll({
      where,
      include: [{ model: OperateurMine, as: 'operateur', attributes: ['id', 'raison_sociale', 'sigle'] }],
      limit,
      offset: (page - 1) * limit,
      order: [['date_mission', 'DESC'], ['numero_mission', 'DESC']]
    });

    res.json({
      data: rows,
      pagination: { page, limit, total: count, pages: Math.ceil(count / limit) }
    });
  } catch (err) {
    console.error('List inspections terrain error:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des inspections' });
  }
});

// GET /api/mines/inspections-terrain/:id
router.get('/:id', param('id').isInt(), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid id' });
    const inspection = await InspectionTerrainMine.findByPk(req.params.id, {
      include: [{ model: OperateurMine, as: 'operateur' }]
    });
    if (!inspection) return res.status(404).json({ error: 'Inspection non trouvée' });
    res.json({ data: inspection });
  } catch (err) {
    console.error('Get inspection terrain error:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération' });
  }
});

// POST /api/mines/inspections-terrain
router.post('/', [
  body('numero_mission').trim().notEmpty().withMessage('Numéro mission requis'),
  body('titre').trim().notEmpty().withMessage('Titre requis'),
  body('date_mission').optional().isISO8601().toDate(),
  body('zone_site').optional().isString().isLength({ max: 150 }),
  body('operateur_id').optional({ nullable: true }).isInt(),
  body('type_inspection').optional().isIn(['routine', 'ciblee', 'suite_plainte', 'autre']),
  body('statut').optional().isIn(['planifiee', 'en_cours', 'terminee', 'reportee', 'annulee']),
  body('rapport_texte').optional().isString(),
  body('conclusions').optional().isString(),
  body('recommandations').optional().isString(),
  body('inspecteur_nom').optional().isString().isLength({ max: 150 }),
  body('date_rapport').optional().isISO8601().toDate(),
  body('notes').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', errors: errors.array() });
    }
    const payload = {
      numero_mission: req.body.numero_mission.trim(),
      titre: req.body.titre.trim(),
      date_mission: req.body.date_mission || null,
      zone_site: req.body.zone_site?.trim() || null,
      operateur_id: req.body.operateur_id ? parseInt(req.body.operateur_id, 10) : null,
      type_inspection: req.body.type_inspection || 'routine',
      statut: req.body.statut || 'planifiee',
      rapport_texte: req.body.rapport_texte?.trim() || null,
      conclusions: req.body.conclusions?.trim() || null,
      recommandations: req.body.recommandations?.trim() || null,
      inspecteur_nom: req.body.inspecteur_nom?.trim() || null,
      date_rapport: req.body.date_rapport || null,
      notes: req.body.notes?.trim() || null
    };
    const inspection = await InspectionTerrainMine.create(payload);
    const withOperateur = await InspectionTerrainMine.findByPk(inspection.id, {
      include: [{ model: OperateurMine, as: 'operateur', attributes: ['id', 'raison_sociale', 'sigle'] }]
    });
    res.status(201).json({ data: withOperateur });
  } catch (err) {
    console.error('Create inspection terrain error:', err);
    res.status(500).json({ error: 'Erreur lors de la création' });
  }
});

// PUT /api/mines/inspections-terrain/:id
router.put('/:id', [
  param('id').isInt(),
  body('numero_mission').optional().trim().notEmpty(),
  body('titre').optional().trim().notEmpty(),
  body('date_mission').optional().isISO8601().toDate(),
  body('zone_site').optional().isString().isLength({ max: 150 }),
  body('operateur_id').optional({ nullable: true }).isInt(),
  body('type_inspection').optional().isIn(['routine', 'ciblee', 'suite_plainte', 'autre']),
  body('statut').optional().isIn(['planifiee', 'en_cours', 'terminee', 'reportee', 'annulee']),
  body('rapport_texte').optional().isString(),
  body('conclusions').optional().isString(),
  body('recommandations').optional().isString(),
  body('inspecteur_nom').optional().isString().isLength({ max: 150 }),
  body('date_rapport').optional().isISO8601().toDate(),
  body('notes').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', errors: errors.array() });
    }
    const inspection = await InspectionTerrainMine.findByPk(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'Inspection non trouvée' });
    const updates = {};
    if (req.body.numero_mission !== undefined) updates.numero_mission = req.body.numero_mission.trim();
    if (req.body.titre !== undefined) updates.titre = req.body.titre.trim();
    if (req.body.date_mission !== undefined) updates.date_mission = req.body.date_mission || null;
    if (req.body.zone_site !== undefined) updates.zone_site = req.body.zone_site?.trim() || null;
    if (req.body.operateur_id !== undefined) updates.operateur_id = req.body.operateur_id ? parseInt(req.body.operateur_id, 10) : null;
    if (req.body.type_inspection !== undefined) updates.type_inspection = req.body.type_inspection;
    if (req.body.statut !== undefined) updates.statut = req.body.statut;
    if (req.body.rapport_texte !== undefined) updates.rapport_texte = req.body.rapport_texte?.trim() || null;
    if (req.body.conclusions !== undefined) updates.conclusions = req.body.conclusions?.trim() || null;
    if (req.body.recommandations !== undefined) updates.recommandations = req.body.recommandations?.trim() || null;
    if (req.body.inspecteur_nom !== undefined) updates.inspecteur_nom = req.body.inspecteur_nom?.trim() || null;
    if (req.body.date_rapport !== undefined) updates.date_rapport = req.body.date_rapport || null;
    if (req.body.notes !== undefined) updates.notes = req.body.notes?.trim() || null;
    await inspection.update(updates);
    const withOperateur = await InspectionTerrainMine.findByPk(inspection.id, {
      include: [{ model: OperateurMine, as: 'operateur', attributes: ['id', 'raison_sociale', 'sigle'] }]
    });
    res.json({ data: withOperateur });
  } catch (err) {
    console.error('Update inspection terrain error:', err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
});

// DELETE /api/mines/inspections-terrain/:id
router.delete('/:id', param('id').isInt(), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid id' });
    const inspection = await InspectionTerrainMine.findByPk(req.params.id);
    if (!inspection) return res.status(404).json({ error: 'Inspection non trouvée' });
    await inspection.destroy();
    res.json({ message: 'Inspection supprimée' });
  } catch (err) {
    console.error('Delete inspection terrain error:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

module.exports = router;

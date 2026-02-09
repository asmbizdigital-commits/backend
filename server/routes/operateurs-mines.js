const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const OperateurMine = require('../models/OperateurMine');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/mines/operateurs - Liste avec filtres
router.get('/', [
  query('statut').optional().isIn(['actif', 'inactif', 'suspendu']),
  query('type_operateur').optional().isIn(['societe_miniere', 'cooperative', 'artisanat', 'autre']),
  query('search').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', errors: errors.array() });
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const { statut, type_operateur, search } = req.query;
    const where = {};
    if (statut) where.statut = statut;
    if (type_operateur) where.type_operateur = type_operateur;
    if (search && search.trim()) {
      where[Op.or] = [
        { raison_sociale: { [Op.like]: `%${search.trim()}%` } },
        { sigle: { [Op.like]: `%${search.trim()}%` } },
        { contact_principal: { [Op.like]: `%${search.trim()}%` } },
        { reference_administrative: { [Op.like]: `%${search.trim()}%` } }
      ];
    }

    const { count, rows } = await OperateurMine.findAndCountAll({
      where,
      limit,
      offset: (page - 1) * limit,
      order: [['raison_sociale', 'ASC']]
    });

    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (err) {
    console.error('List operateurs error:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération des opérateurs' });
  }
});

// GET /api/mines/operateurs/:id - Détail
router.get('/:id', param('id').isInt(), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid id' });
    const operateur = await OperateurMine.findByPk(req.params.id);
    if (!operateur) return res.status(404).json({ error: 'Opérateur non trouvé' });
    res.json({ data: operateur });
  } catch (err) {
    console.error('Get operateur error:', err);
    res.status(500).json({ error: 'Erreur lors de la récupération' });
  }
});

// POST /api/mines/operateurs - Créer
router.post('/', [
  body('raison_sociale').trim().notEmpty().withMessage('Raison sociale requise'),
  body('sigle').optional().isString().isLength({ max: 50 }),
  body('type_operateur').optional().isIn(['societe_miniere', 'cooperative', 'artisanat', 'autre']),
  body('reference_administrative').optional().isString().isLength({ max: 100 }),
  body('adresse').optional().isString().isLength({ max: 255 }),
  body('telephone').optional().isString().isLength({ max: 50 }),
  body('email').optional().isEmail().withMessage('Email invalide').normalizeEmail(),
  body('contact_principal').optional().isString().isLength({ max: 150 }),
  body('statut').optional().isIn(['actif', 'inactif', 'suspendu']),
  body('notes').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', errors: errors.array() });
    }
    const payload = {
      raison_sociale: req.body.raison_sociale.trim(),
      sigle: req.body.sigle?.trim() || null,
      type_operateur: req.body.type_operateur || 'societe_miniere',
      reference_administrative: req.body.reference_administrative?.trim() || null,
      adresse: req.body.adresse?.trim() || null,
      telephone: req.body.telephone?.trim() || null,
      email: req.body.email?.trim() || null,
      contact_principal: req.body.contact_principal?.trim() || null,
      statut: req.body.statut || 'actif',
      notes: req.body.notes?.trim() || null
    };
    const operateur = await OperateurMine.create(payload);
    res.status(201).json({ data: operateur });
  } catch (err) {
    console.error('Create operateur error:', err);
    res.status(500).json({ error: 'Erreur lors de la création' });
  }
});

// PUT /api/mines/operateurs/:id - Modifier
router.put('/:id', [
  param('id').isInt(),
  body('raison_sociale').optional().trim().notEmpty(),
  body('sigle').optional().isString().isLength({ max: 50 }),
  body('type_operateur').optional().isIn(['societe_miniere', 'cooperative', 'artisanat', 'autre']),
  body('reference_administrative').optional().isString().isLength({ max: 100 }),
  body('adresse').optional().isString().isLength({ max: 255 }),
  body('telephone').optional().isString().isLength({ max: 50 }),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Email invalide').normalizeEmail(),
  body('contact_principal').optional().isString().isLength({ max: 150 }),
  body('statut').optional().isIn(['actif', 'inactif', 'suspendu']),
  body('notes').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', errors: errors.array() });
    }
    const operateur = await OperateurMine.findByPk(req.params.id);
    if (!operateur) return res.status(404).json({ error: 'Opérateur non trouvé' });
    const updates = {};
    if (req.body.raison_sociale !== undefined) updates.raison_sociale = req.body.raison_sociale.trim();
    if (req.body.sigle !== undefined) updates.sigle = req.body.sigle?.trim() || null;
    if (req.body.type_operateur !== undefined) updates.type_operateur = req.body.type_operateur;
    if (req.body.reference_administrative !== undefined) updates.reference_administrative = req.body.reference_administrative?.trim() || null;
    if (req.body.adresse !== undefined) updates.adresse = req.body.adresse?.trim() || null;
    if (req.body.telephone !== undefined) updates.telephone = req.body.telephone?.trim() || null;
    if (req.body.email !== undefined) updates.email = req.body.email?.trim() || null;
    if (req.body.contact_principal !== undefined) updates.contact_principal = req.body.contact_principal?.trim() || null;
    if (req.body.statut !== undefined) updates.statut = req.body.statut;
    if (req.body.notes !== undefined) updates.notes = req.body.notes?.trim() || null;
    await operateur.update(updates);
    res.json({ data: operateur });
  } catch (err) {
    console.error('Update operateur error:', err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
});

// DELETE /api/mines/operateurs/:id
router.delete('/:id', param('id').isInt(), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid id' });
    const operateur = await OperateurMine.findByPk(req.params.id);
    if (!operateur) return res.status(404).json({ error: 'Opérateur non trouvé' });
    await operateur.destroy();
    res.json({ message: 'Opérateur supprimé' });
  } catch (err) {
    console.error('Delete operateur error:', err);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

module.exports = router;

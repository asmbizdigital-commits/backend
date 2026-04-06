const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { Op } = require('sequelize');
const BureauInternational = require('../models/BureauInternational');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

router.get('/', [
  query('statut').optional().isIn(['Actif', 'Inactif']),
  query('search').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', message: 'Paramètres invalides', errors: errors.array() });
    }
    const { statut, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const where = {};
    if (statut) where.statut = statut;
    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      where[Op.or] = [
        { nom: { [Op.like]: s } },
        { code: { [Op.like]: s } },
        { pays: { [Op.like]: s } },
        { ville: { [Op.like]: s } },
        { responsable_bureau: { [Op.like]: s } },
        { email: { [Op.like]: s } }
      ];
    }
    const { count, rows } = await BureauInternational.findAndCountAll({
      where,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      order: [['nom', 'ASC']]
    });
    res.json({
      bureauxInternationaux: rows,
      pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10), total: count, pages: Math.ceil(count / limit) }
    });
  } catch (error) {
    console.error('GET bureaux-internationaux:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des bureaux internationaux' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await BureauInternational.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: 'Bureau international non trouvé' });
    res.json({ bureauInternational: row });
  } catch (error) {
    console.error('GET bureaux-internationaux/:id:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.post('/', [
  requireRole(['Administrateur', 'Patron']),
  body('nom').trim().isLength({ min: 1, max: 200 }),
  body('code').optional({ nullable: true }).trim().isLength({ max: 30 }),
  body('pays').optional({ nullable: true }).trim().isLength({ max: 150 }),
  body('ville').optional({ nullable: true }).trim().isLength({ max: 150 }),
  body('responsable_bureau').optional({ nullable: true }).trim().isLength({ max: 255 }),
  body('email').optional({ values: 'falsy' }).isEmail(),
  body('telephone').optional({ nullable: true }).trim().isLength({ max: 50 }),
  body('adresse').optional({ nullable: true }).isString(),
  body('statut').optional().isIn(['Actif', 'Inactif'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Données invalides', errors: errors.array() });
    }
    const payload = {
      nom: req.body.nom.trim(),
      code: req.body.code?.trim() || null,
      pays: req.body.pays?.trim() || null,
      ville: req.body.ville?.trim() || null,
      responsable_bureau: req.body.responsable_bureau?.trim() || null,
      email: req.body.email?.trim() || null,
      telephone: req.body.telephone?.trim() || null,
      adresse: req.body.adresse?.trim() || null,
      statut: req.body.statut || 'Actif'
    };
    if (payload.code) {
      const exists = await BureauInternational.findOne({ where: { code: payload.code } });
      if (exists) return res.status(400).json({ message: 'Ce code est déjà utilisé' });
    }
    const created = await BureauInternational.create(payload);
    res.status(201).json({ message: 'Bureau international créé', bureauInternational: created });
  } catch (error) {
    console.error('POST bureaux-internationaux:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ message: 'Ce code est déjà utilisé' });
    }
    res.status(500).json({ message: 'Erreur lors de la création' });
  }
});

router.put('/:id', [
  requireRole(['Administrateur', 'Patron']),
  body('nom').optional().trim().isLength({ min: 1, max: 200 }),
  body('code').optional({ nullable: true }).trim().isLength({ max: 30 }),
  body('pays').optional({ nullable: true }).trim().isLength({ max: 150 }),
  body('ville').optional({ nullable: true }).trim().isLength({ max: 150 }),
  body('responsable_bureau').optional({ nullable: true }).trim().isLength({ max: 255 }),
  body('email').optional({ values: 'falsy' }).isEmail(),
  body('telephone').optional({ nullable: true }).trim().isLength({ max: 50 }),
  body('adresse').optional({ nullable: true }).isString(),
  body('statut').optional().isIn(['Actif', 'Inactif'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Données invalides', errors: errors.array() });
    }
    const row = await BureauInternational.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: 'Bureau international non trouvé' });
    const updates = {};
    if (req.body.nom !== undefined) updates.nom = req.body.nom.trim();
    if (req.body.code !== undefined) updates.code = req.body.code?.trim() || null;
    if (req.body.pays !== undefined) updates.pays = req.body.pays?.trim() || null;
    if (req.body.ville !== undefined) updates.ville = req.body.ville?.trim() || null;
    if (req.body.responsable_bureau !== undefined) updates.responsable_bureau = req.body.responsable_bureau?.trim() || null;
    if (req.body.email !== undefined) updates.email = req.body.email?.trim() || null;
    if (req.body.telephone !== undefined) updates.telephone = req.body.telephone?.trim() || null;
    if (req.body.adresse !== undefined) updates.adresse = req.body.adresse?.trim() || null;
    if (req.body.statut !== undefined) updates.statut = req.body.statut;
    if (updates.code && updates.code !== row.code) {
      const exists = await BureauInternational.findOne({ where: { code: updates.code } });
      if (exists) return res.status(400).json({ message: 'Ce code est déjà utilisé' });
    }
    await row.update(updates);
    res.json({ message: 'Bureau international mis à jour', bureauInternational: row });
  } catch (error) {
    console.error('PUT bureaux-internationaux:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ message: 'Ce code est déjà utilisé' });
    }
    res.status(500).json({ message: 'Erreur lors de la mise à jour' });
  }
});

router.delete('/:id', [requireRole(['Administrateur', 'Patron'])], async (req, res) => {
  try {
    const row = await BureauInternational.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: 'Bureau international non trouvé' });
    await row.destroy();
    res.json({ message: 'Bureau international supprimé' });
  } catch (error) {
    console.error('DELETE bureaux-internationaux:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression' });
  }
});

module.exports = router;

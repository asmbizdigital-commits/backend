const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const Client = require('../models/Client');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/clients — liste avec recherche et filtres
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim(),
  query('type_client').optional().isIn(['particulier', 'entreprise']),
  query('actif').optional().isIn(['true', 'false']),
  query('ville').optional().trim(),
  query('categorie').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;
    const where = {};

    if (req.query.type_client) where.type_client = req.query.type_client;
    if (req.query.actif !== undefined) where.actif = req.query.actif === 'true';
    if (req.query.ville) where.ville = { [Op.like]: `%${req.query.ville}%` };
    if (req.query.categorie) where.categorie = req.query.categorie;

    if (req.query.search && req.query.search.trim()) {
      const term = `%${req.query.search.trim()}%`;
      where[Op.or] = [
        { nom: { [Op.like]: term } },
        { prenom: { [Op.like]: term } },
        { raison_sociale: { [Op.like]: term } },
        { email: { [Op.like]: term } },
        { telephone: { [Op.like]: term } },
        { mobile: { [Op.like]: term } },
        { ville: { [Op.like]: term } },
        { numero_nif: { [Op.like]: term } }
      ];
    }

    const { count, rows } = await Client.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return res.json({
      data: rows,
      pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) }
    });
  } catch (err) {
    console.error('Clients list:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/clients/search — recherche rapide (autocomplete, limit 20)
router.get('/search', [
  query('q').optional().trim(),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    if (!q || q.length < 2) {
      return res.json({ data: [] });
    }
    const term = `%${q}%`;
    const rows = await Client.findAll({
      where: {
        actif: true,
        [Op.or]: [
          { nom: { [Op.like]: term } },
          { prenom: { [Op.like]: term } },
          { raison_sociale: { [Op.like]: term } },
          { email: { [Op.like]: term } },
          { telephone: { [Op.like]: term } }
        ]
      },
      order: [['raison_sociale', 'ASC'], ['nom', 'ASC']],
      limit
    });
    return res.json({ data: rows });
  } catch (err) {
    console.error('Clients search:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/clients/:id
router.get('/:id', async (req, res) => {
  try {
    const client = await Client.findByPk(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client non trouvé' });
    return res.json({ data: client });
  } catch (err) {
    console.error('Client get:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/clients
const createUpdateValidations = [
  body('type_client').optional().isIn(['particulier', 'entreprise']),
  body('nom').optional().trim(),
  body('prenom').optional().trim(),
  body('raison_sociale').optional().trim(),
  body('forme_juridique').optional().trim(),
  body('email').optional().trim().isEmail().withMessage('Email invalide'),
  body('telephone').optional().trim(),
  body('telephone_secondaire').optional().trim(),
  body('mobile').optional().trim(),
  body('fax').optional().trim(),
  body('adresse').optional().trim(),
  body('complement_adresse').optional().trim(),
  body('code_postal').optional().trim(),
  body('ville').optional().trim(),
  body('region').optional().trim(),
  body('pays').optional().trim(),
  body('numero_nif').optional().trim(),
  body('numero_rc').optional().trim(),
  body('numero_piece').optional().trim(),
  body('type_piece').optional().trim(),
  body('categorie').optional().trim(),
  body('source').optional().trim(),
  body('notes').optional().trim(),
  body('tags').optional(),
  body('actif').optional().isBoolean(),
  body('assujetti').optional().isBoolean()
];

router.post('/', createUpdateValidations, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });

    const payload = { ...req.body };
    if (payload.tags && Array.isArray(payload.tags)) payload.tags = JSON.stringify(payload.tags);
    payload.created_by = req.user?.id || null;

    const client = await Client.create(payload);
    return res.status(201).json({ data: client, message: 'Client créé' });
  } catch (err) {
    console.error('Client create:', err);
    return res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// PUT /api/clients/:id
router.put('/:id', createUpdateValidations, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });

    const client = await Client.findByPk(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client non trouvé' });

    const payload = { ...req.body };
    if (payload.tags && Array.isArray(payload.tags)) payload.tags = JSON.stringify(payload.tags);

    await client.update(payload);
    return res.json({ data: client, message: 'Client mis à jour' });
  } catch (err) {
    console.error('Client update:', err);
    return res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// DELETE /api/clients/:id
router.delete('/:id', async (req, res) => {
  try {
    const client = await Client.findByPk(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client non trouvé' });
    await client.destroy();
    return res.json({ message: 'Client supprimé' });
  } catch (err) {
    console.error('Client delete:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;

const express = require('express');
const { query, validationResult } = require('express-validator');
const Zone = require('../models/Zone');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

router.get(
  '/',
  [query('statut').optional().isIn(['Actif', 'Inactif'])],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Paramètres invalides', errors: errors.array() });
      }
      const where = {};
      if (req.query.statut) where.statut = req.query.statut;
      else where.statut = 'Actif';

      const zones = await Zone.findAll({
        where,
        order: [['nom', 'ASC']]
      });
      res.json({ zones });
    } catch (error) {
      console.error('GET /api/zones', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des zones' });
    }
  }
);

module.exports = router;

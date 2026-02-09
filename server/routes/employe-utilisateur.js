const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const EmployeUser = require('../models/EmployeUser');
const { User, Employe } = require('../models');

// GET /api/employe-utilisateur/list — liste de toutes les liaisons (pour afficher les utilisateurs déjà liés)
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const liaisons = await EmployeUser.findAll({
      include: [
        { model: User, as: 'user', attributes: ['id', 'nom', 'prenom', 'email', 'role'] },
        { model: Employe, as: 'employe', attributes: ['id', 'prenoms', 'nom_famille', 'matricule'] }
      ],
      order: [['id', 'ASC']]
    });
    res.json({
      success: true,
      data: liaisons.map((l) => l.get({ plain: true }))
    });
  } catch (error) {
    console.error('Erreur liste liaisons employé-utilisateur:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// GET /api/employe-utilisateur?employe_id= ou ?user_id= — récupérer la liaison (par employé ou par utilisateur connecté)
router.get('/', authenticateToken, [
  query('employe_id').optional().isInt({ min: 1 }),
  query('user_id').optional().isInt({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Paramètres invalides', errors: errors.array() });
    }
    const { employe_id, user_id } = req.query;
    if (!employe_id && !user_id) {
      return res.status(400).json({ success: false, message: 'employe_id ou user_id requis' });
    }

    const where = employe_id
      ? { employe_id: parseInt(employe_id, 10) }
      : { user_id: parseInt(user_id, 10) };

    const liaison = await EmployeUser.findOne({
      where,
      include: [
        { model: User, as: 'user', attributes: ['id', 'nom', 'prenom', 'email', 'role', 'actif'] },
        { model: Employe, as: 'employe', attributes: ['id', 'prenoms', 'nom_famille', 'nom_usage', 'matricule'] }
      ]
    });

    res.json({
      success: true,
      data: liaison ? liaison.get({ plain: true }) : null
    });
  } catch (error) {
    console.error('Erreur récupération liaison employé-utilisateur:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// POST /api/employe-utilisateur — créer une liaison employé ↔ utilisateur
router.post('/', authenticateToken, [
  body('employe_id').isInt({ min: 1 }).withMessage('employe_id requis'),
  body('user_id').isInt({ min: 1 }).withMessage('user_id requis')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Données invalides', errors: errors.array() });
    }
    const { employe_id, user_id } = req.body;
    const eId = parseInt(employe_id, 10);
    const uId = parseInt(user_id, 10);

    const existingByEmploye = await EmployeUser.findOne({ where: { employe_id: eId } });
    if (existingByEmploye) {
      return res.status(409).json({
        success: false,
        message: 'Cet employé est déjà lié à un utilisateur.'
      });
    }
    const existingByUser = await EmployeUser.findOne({ where: { user_id: uId } });
    if (existingByUser) {
      return res.status(409).json({
        success: false,
        message: 'Cet utilisateur est déjà lié à un employé.'
      });
    }

    const liaison = await EmployeUser.create({ employe_id: eId, user_id: uId });
    const withUser = await EmployeUser.findByPk(liaison.id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'nom', 'prenom', 'email', 'role', 'actif'] }]
    });

    res.status(201).json({
      success: true,
      data: withUser.get({ plain: true }),
      message: 'Liaison créée.'
    });
  } catch (error) {
    console.error('Erreur création liaison employé-utilisateur:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// DELETE /api/employe-utilisateur?employe_id= — supprimer la liaison pour un employé
router.delete('/', authenticateToken, [
  query('employe_id').optional().isInt({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Paramètres invalides', errors: errors.array() });
    }
    const { employe_id } = req.query;
    if (!employe_id) {
      return res.status(400).json({ success: false, message: 'employe_id requis' });
    }

    const deleted = await EmployeUser.destroy({
      where: { employe_id: parseInt(employe_id, 10) }
    });

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Aucune liaison trouvée pour cet employé.' });
    }

    res.json({
      success: true,
      message: 'Liaison supprimée.'
    });
  } catch (error) {
    console.error('Erreur suppression liaison employé-utilisateur:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

module.exports = router;

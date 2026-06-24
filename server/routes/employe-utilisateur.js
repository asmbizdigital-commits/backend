const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const EmployeUser = require('../models/EmployeUser');
const Employee = require('../models/Employee');
const { User, Employe } = require('../models');

const USER_ROLES = [
  'Agent Chambre', 'Superviseur Resto', 'Superviseur Buanderie',
  'Superviseur Housing', 'Superviseur RH', 'Superviseur Comptable',
  'Web Master', 'Superviseur Finance', 'Agent', 'Superviseur',
  'Administrateur', 'Patron', 'Guichetier', 'Superviseur Stock', 'Auditeur',
  'Superviseur Technique', 'Agent Exterieur', 'Agent Gouvernant', 'Booker',
  'call_center', 'Saisisseur', 'Verificateur Sygrem',
  'Gestionnaire des Plaintes', 'Manager Bureau', 'Directeur Opérations', 'Directeur Operations'
];

function mapPosteToRole(poste) {
  const p = String(poste || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (p.includes('verificateur') || p.includes('verifier') || p.includes('controlleur') || p.includes('controleur')) {
    return 'Verificateur Sygrem';
  }
  if (p.includes('saisisseur') || p.includes('saisie')) return 'Saisisseur';
  if (p.includes('guichet')) return 'Guichetier';
  if (p.includes('call center') || p.includes('call_center')) return 'call_center';
  if (p.includes('rh') || p.includes('ressources humaines')) return 'Superviseur RH';
  if (p.includes('comptab')) return 'Superviseur Comptable';
  if (p.includes('finance')) return 'Superviseur Finance';
  if (p.includes('directeur') && p.includes('operation')) return 'Directeur Opérations';
  if (p.includes('plainte')) return 'Gestionnaire des Plaintes';
  if (p.includes('manager') && p.includes('bureau')) return 'Manager Bureau';
  if (p.includes('auditeur')) return 'Auditeur';
  return 'Agent';
}

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

// POST /api/employe-utilisateur/create-user-from-employe — compte + liaison
router.post('/create-user-from-employe', authenticateToken, [
  body('employe_id').isInt({ min: 1 }).withMessage('employe_id requis'),
  body('mot_de_passe').isLength({ min: 6 }).withMessage('Mot de passe min. 6 caractères'),
  body('role').optional().isIn(USER_ROLES),
  body('nom').optional().isLength({ min: 2, max: 100 }),
  body('prenom').optional().isLength({ min: 2, max: 100 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('telephone').optional().isLength({ max: 20 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Données invalides',
        errors: errors.array()
      });
    }

    const employeId = parseInt(req.body.employe_id, 10);
    const employee = await Employee.findById(employeId);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employé non trouvé' });
    }

    const existingByEmploye = await EmployeUser.findOne({ where: { employe_id: employeId } });
    if (existingByEmploye) {
      return res.status(409).json({
        success: false,
        message: 'Cet employé est déjà lié à un utilisateur.'
      });
    }

    const email = (req.body.email || employee.email_personnel || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email requis (fiche employé ou formulaire)'
      });
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      const linked = await EmployeUser.findOne({ where: { user_id: existingUser.id } });
      return res.status(400).json({
        success: false,
        message: linked
          ? 'Cet email est déjà utilisé par un autre compte lié.'
          : 'Cet email existe déjà. Liez l\'employé à cet utilisateur existant.'
      });
    }

    const nom = (req.body.nom || employee.nom_famille || '').trim();
    const prenom = (req.body.prenom || employee.prenoms || '').trim();
    if (nom.length < 2 || prenom.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Nom et prénom requis (min. 2 caractères)'
      });
    }

    const user = await User.create({
      nom,
      prenom,
      email,
      mot_de_passe: req.body.mot_de_passe,
      role: req.body.role || mapPosteToRole(employee.poste),
      telephone: req.body.telephone || employee.telephone_personnel || null,
      departement_id: employee.departement_id || null,
      sous_departement_id: employee.sous_departement_id || null,
      actif: true
    });

    const liaison = await EmployeUser.create({ employe_id: employeId, user_id: user.id });
    const withUser = await EmployeUser.findByPk(liaison.id, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'nom', 'prenom', 'email', 'role', 'actif'] },
        { model: Employe, as: 'employe', attributes: ['id', 'prenoms', 'nom_famille', 'matricule'] }
      ]
    });

    res.status(201).json({
      success: true,
      message: 'Compte créé et lié à l\'employé.',
      data: withUser.get({ plain: true }),
      user: {
        id: user.id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Erreur création utilisateur depuis employé:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erreur serveur'
    });
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

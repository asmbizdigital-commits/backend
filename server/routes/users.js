const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { Op } = require('sequelize');
const User = require('../models/User');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

/** Département, sous-département, zone et rattachements bureaux facultatifs (null si absents). */
function normalizeUserDepartmentFields(userData) {
  if (userData.departement_id === '' || userData.departement_id === undefined) {
    userData.departement_id = null;
  } else if (userData.departement_id != null) {
    const dep = parseInt(String(userData.departement_id), 10);
    userData.departement_id = Number.isNaN(dep) ? null : dep;
  }

  if (userData.sous_departement_id === '' || userData.sous_departement_id === undefined) {
    userData.sous_departement_id = null;
  } else if (userData.sous_departement_id != null) {
    const sous = parseInt(String(userData.sous_departement_id), 10);
    userData.sous_departement_id = Number.isNaN(sous) ? null : sous;
  }

  if (!userData.departement_id) {
    userData.sous_departement_id = null;
  }

  if (userData.zone === '' || userData.zone === undefined) {
    userData.zone = null;
  }

  if (userData.direction_provinciale_id === '' || userData.direction_provinciale_id === undefined) {
    userData.direction_provinciale_id = null;
  } else if (userData.direction_provinciale_id != null) {
    const dir = parseInt(String(userData.direction_provinciale_id), 10);
    userData.direction_provinciale_id = Number.isNaN(dir) ? null : dir;
  }

  if (userData.bureau_international_id === '' || userData.bureau_international_id === undefined) {
    userData.bureau_international_id = null;
  } else if (userData.bureau_international_id != null) {
    const bur = parseInt(String(userData.bureau_international_id), 10);
    userData.bureau_international_id = Number.isNaN(bur) ? null : bur;
  }

  return userData;
}

const USER_ZONE_VALUES = ['europe', 'asie', 'afrique', 'moyenOrient'];

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/users - Get all users (temporarily allowing all authenticated users for testing)
router.get('/', [
  // requireRole('Administrateur'), // Temporarily commented for testing
  query('nom').optional().isString().trim().isLength({ max: 100 }),
  query('role').optional().isIn([
    'Agent Chambre', 'Superviseur Resto', 'Superviseur Buanderie', 
    'Superviseur Housing', 'Superviseur RH', 'Superviseur Comptable', 
    'Web Master', 'Superviseur Finance', 'Agent', 'Superviseur', 
    'Administrateur', 'Patron', 'Guichetier', 'Superviseur Stock', 'Auditeur',
    'Superviseur Technique', 'Agent Exterieur', 'Agent Gouvernant', 'Booker',
    'call_center', 'Saisisseur', 'Verificateur Sygrem', 'Controlleur Sygram',
    'Gestionnaire des Plaintes', 'Manager Bureau', 'Directeur Opérations', 'Directeur Operations'
  ]),
  query('actif').optional().isBoolean(),
  query('departement_id').optional().isInt({ min: 1 }),
  query('sous_departement_id').optional().isInt({ min: 1 }),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 10000 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Paramètres de validation invalides',
        errors: errors.array()
      });
    }

    const { nom, role, actif, departement_id, sous_departement_id, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Build where clause
    const whereClause = {};
    if (role) whereClause.role = role;
    if (actif !== undefined) whereClause.actif = actif === 'true';
    if (departement_id) whereClause.departement_id = parseInt(departement_id);
    if (sous_departement_id) whereClause.sous_departement_id = parseInt(sous_departement_id);
    if (nom && nom.trim()) {
      const terms = nom
        .trim()
        .split(/\s+/)
        .map((term) => term.trim())
        .filter(Boolean);

      if (terms.length > 0) {
        whereClause[Op.and] = terms.map((term) => ({
          [Op.or]: [
            { nom: { [Op.like]: `%${term}%` } },
            { prenom: { [Op.like]: `%${term}%` } }
          ]
        }));
      }
    }

    const { count, rows: users } = await User.findAndCountAll({
      where: whereClause,
      attributes: { exclude: ['mot_de_passe'] },
      include: [
        {
          model: require('../models/Departement'),
          as: 'Departement',
          attributes: ['id', 'nom', 'code', 'couleur']
        },
        {
          model: require('../models/SousDepartement'),
          as: 'SousDepartement',
          attributes: ['id', 'nom', 'code', 'couleur']
        },
        {
          model: require('../models/DirectionProvinciale'),
          as: 'DirectionProvinciale',
          attributes: ['id', 'nom', 'code', 'province']
        },
        {
          model: require('../models/BureauInternational'),
          as: 'BureauInternational',
          attributes: ['id', 'nom', 'code', 'pays', 'ville']
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['nom', 'ASC'], ['prenom', 'ASC']]
    });

    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ 
      error: 'Failed to get users',
      message: 'Erreur lors de la récupération des utilisateurs'
    });
  }
});

// GET /api/users/stats/overview - Get user statistics (temporarily allowing all authenticated users for testing)
router.get('/stats/overview', [
  // requireRole('Administrateur') // Temporarily commented for testing
], async (req, res) => {
  try {
    const totalUsers = await User.count();
    const activeUsers = await User.count({ where: { actif: true } });
    const inactiveUsers = await User.count({ where: { actif: false } });

    // Get users by role
    const usersByRole = await User.findAll({
      attributes: [
        'role',
        [User.sequelize.fn('COUNT', User.sequelize.col('id')), 'count']
      ],
      group: ['role']
    });

    // Get recent logins (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentLogins = await User.count({
      where: {
        derniere_connexion: {
          [Op.gte]: sevenDaysAgo
        }
      }
    });

    res.json({
      stats: {
        total: totalUsers,
        active: activeUsers,
        inactive: inactiveUsers,
        recentLogins
      },
      usersByRole
    });

  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ 
      error: 'Failed to get user statistics',
      message: 'Erreur lors de la récupération des statistiques'
    });
  }
});

// GET /api/users/connections/today - Get users connected today
router.get('/connections/today', async (req, res) => {
  try {
    const { Op } = require('sequelize');
    
    // Récupérer la date d'aujourd'hui (début et fin de journée)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Récupérer tous les utilisateurs connectés aujourd'hui
    const usersConnectedToday = await User.findAll({
      where: {
        derniere_connexion: {
          [Op.between]: [today, endOfDay]
        },
        actif: true
      },
      attributes: [
        'id',
        'nom',
        'prenom',
        'email',
        'role',
        'derniere_connexion',
        'telephone',
        'actif'
      ],
      include: [
        {
          model: require('../models/Departement'),
          as: 'Departement',
          attributes: ['id', 'nom', 'code']
        },
        {
          model: require('../models/SousDepartement'),
          as: 'SousDepartement',
          attributes: ['id', 'nom', 'code']
        }
      ],
      order: [['derniere_connexion', 'DESC']]
    });
    
    res.json({
      success: true,
      users: usersConnectedToday,
      count: usersConnectedToday.length,
      date: today.toISOString().split('T')[0]
    });
    
  } catch (error) {
    console.error('Get users connected today error:', error);
    res.status(500).json({ 
      error: 'Failed to get users connected today',
      message: 'Erreur lors de la récupération des utilisateurs connectés aujourd\'hui'
    });
  }
});

// GET /api/users/:id - Get specific user
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Users can only view their own profile unless they're Administrateur or Patron
    if (parseInt(id) !== req.user.id && !req.user.hasPermission('Administrateur')) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: 'Permissions insuffisantes pour voir ce profil'
      });
    }

    const user = await User.findByPk(id, {
      attributes: { exclude: ['mot_de_passe'] }
    });

    if (!user) {
      return res.status(404).json({ 
        error: 'User not found',
        message: 'Utilisateur non trouvé'
      });
    }

    res.json({ user });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ 
      error: 'Failed to get user',
      message: 'Erreur lors de la récupération de l\'utilisateur'
    });
  }
});

// POST /api/users - Create new user (temporarily allowing all authenticated users for testing)
router.post('/', [
  // requireRole('Administrateur'), // Temporarily commented for testing
  body('nom').isLength({ min: 2, max: 100 }),
  body('prenom').isLength({ min: 2, max: 100 }),
  body('email').isEmail().normalizeEmail(),
  body('mot_de_passe').isLength({ min: 6 }),
  body('role').isIn([
    'Agent Chambre', 'Superviseur Resto', 'Superviseur Buanderie', 
    'Superviseur Housing', 'Superviseur RH', 'Superviseur Comptable', 
    'Web Master', 'Superviseur Finance', 'Agent', 'Superviseur', 
    'Administrateur', 'Patron', 'Guichetier', 'Superviseur Stock', 'Auditeur',
    'Superviseur Technique', 'Agent Exterieur', 'Agent Gouvernant', 'Booker',
    'call_center', 'Saisisseur', 'Verificateur Sygrem', 'Controlleur Sygram',
    'Gestionnaire des Plaintes', 'Manager Bureau', 'Directeur Opérations', 'Directeur Operations'
  ]),
  body('telephone').optional().isLength({ max: 20 }),
  body('departement_id').optional().custom((value) => {
    // Accepter null, undefined, chaîne vide, ou un entier positif
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'number' && Number.isInteger(value) && value >= 1) return true;
    if (typeof value === 'string') {
      const num = parseInt(value);
      if (!isNaN(num) && Number.isInteger(num) && num >= 1) return true;
    }
    throw new Error('departement_id doit être un entier positif ou vide');
  }),
  body('sous_departement_id').optional().custom((value) => {
    // Accepter null, undefined, chaîne vide, ou un entier positif
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'number' && Number.isInteger(value) && value >= 1) return true;
    if (typeof value === 'string') {
      const num = parseInt(value);
      if (!isNaN(num) && Number.isInteger(num) && num >= 1) return true;
    }
    throw new Error('sous_departement_id doit être un entier positif ou vide');
  }),
  body('zone').optional({ nullable: true }).isIn(USER_ZONE_VALUES),
  body('direction_provinciale_id').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'number' && Number.isInteger(value) && value >= 1) return true;
    if (typeof value === 'string') {
      const num = parseInt(value, 10);
      if (!isNaN(num) && Number.isInteger(num) && num >= 1) return true;
    }
    throw new Error('direction_provinciale_id doit être un entier positif ou vide');
  }),
  body('bureau_international_id').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'number' && Number.isInteger(value) && value >= 1) return true;
    if (typeof value === 'string') {
      const num = parseInt(value, 10);
      if (!isNaN(num) && Number.isInteger(num) && num >= 1) return true;
    }
    throw new Error('bureau_international_id doit être un entier positif ou vide');
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('User creation validation errors:', errors.array());
      console.error('Request body:', req.body);
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Données de validation invalides',
        errors: errors.array()
      });
    }

    const userData = normalizeUserDepartmentFields({ ...req.body });
    
    // Check if email already exists
    const existingUser = await User.findOne({ 
      where: { email: userData.email }
    });

    if (existingUser) {
      return res.status(400).json({ 
        error: 'Email already exists',
        message: 'Cet email existe déjà'
      });
    }

    const user = await User.create(userData);

    // Return user without password
    const userResponse = {
      id: user.id,
      nom: user.nom,
      prenom: user.prenom,
      email: user.email,
      role: user.role,
      telephone: user.telephone,
      departement_id: user.departement_id,
      sous_departement_id: user.sous_departement_id,
      zone: user.zone,
      direction_provinciale_id: user.direction_provinciale_id,
      bureau_international_id: user.bureau_international_id,
      actif: user.actif,
      derniere_connexion: user.derniere_connexion
    };

    res.status(201).json({
      message: 'Utilisateur créé avec succès',
      user: userResponse
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ 
      error: 'Failed to create user',
      message: 'Erreur lors de la création de l\'utilisateur'
    });
  }
});

// PUT /api/users/:id - Update user
router.put('/:id', [
  body('nom').optional().isLength({ min: 2, max: 100 }),
  body('prenom').optional().isLength({ min: 2, max: 100 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('role').optional().isIn([
    'Agent Chambre', 'Superviseur Resto', 'Superviseur Buanderie', 
    'Superviseur Housing', 'Superviseur RH', 'Superviseur Comptable', 
    'Web Master', 'Superviseur Finance', 'Agent', 'Superviseur', 
    'Administrateur', 'Patron', 'Guichetier', 'Superviseur Stock', 'Auditeur',
    'Superviseur Technique', 'Agent Exterieur', 'Agent Gouvernant', 'Booker',
    'call_center', 'Saisisseur', 'Verificateur Sygrem', 'Controlleur Sygram',
    'Gestionnaire des Plaintes', 'Manager Bureau', 'Directeur Opérations', 'Directeur Operations'
  ]),
  body('telephone').optional().isLength({ max: 20 }),
  body('actif').optional().isBoolean(),
  body('departement_id').optional().custom((value) => {
    // Accepter null, undefined, chaîne vide, ou un entier positif
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'number' && Number.isInteger(value) && value >= 1) return true;
    if (typeof value === 'string') {
      const num = parseInt(value);
      if (!isNaN(num) && Number.isInteger(num) && num >= 1) return true;
    }
    throw new Error('departement_id doit être un entier positif ou vide');
  }),
  body('sous_departement_id').optional().custom((value) => {
    // Accepter null, undefined, chaîne vide, ou un entier positif
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'number' && Number.isInteger(value) && value >= 1) return true;
    if (typeof value === 'string') {
      const num = parseInt(value);
      if (!isNaN(num) && Number.isInteger(num) && num >= 1) return true;
    }
    throw new Error('sous_departement_id doit être un entier positif ou vide');
  }),
  body('zone').optional({ nullable: true }).isIn(USER_ZONE_VALUES),
  body('direction_provinciale_id').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'number' && Number.isInteger(value) && value >= 1) return true;
    if (typeof value === 'string') {
      const num = parseInt(value, 10);
      if (!isNaN(num) && Number.isInteger(num) && num >= 1) return true;
    }
    throw new Error('direction_provinciale_id doit être un entier positif ou vide');
  }),
  body('bureau_international_id').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'number' && Number.isInteger(value) && value >= 1) return true;
    if (typeof value === 'string') {
      const num = parseInt(value, 10);
      if (!isNaN(num) && Number.isInteger(num) && num >= 1) return true;
    }
    throw new Error('bureau_international_id doit être un entier positif ou vide');
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Données de validation invalides',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const userData = normalizeUserDepartmentFields({ ...req.body });

    // Check permissions
    if (parseInt(id) !== req.user.id && !req.user.hasPermission('Administrateur')) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: 'Permissions insuffisantes pour modifier cet utilisateur'
      });
    }

    // Only Administrateur can change roles
    if (userData.role && !req.user.hasPermission('Administrateur')) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: 'Seuls les administrateurs peuvent modifier les rôles'
      });
    }

    const user = await User.findByPk(id);

    if (!user) {
      return res.status(404).json({ 
        error: 'User not found',
        message: 'Utilisateur non trouvé'
      });
    }

    // Check if new email conflicts with existing user
    if (userData.email && userData.email !== user.email) {
      const existingUser = await User.findOne({ 
        where: { email: userData.email }
      });

      if (existingUser) {
        return res.status(400).json({ 
          error: 'Email already exists',
          message: 'Cet email existe déjà'
        });
      }
    }

    await user.update(userData);

    // Return user without password
    const userResponse = {
      id: user.id,
      nom: user.nom,
      prenom: user.prenom,
      email: user.email,
      role: user.role,
      telephone: user.telephone,
      departement_id: user.departement_id,
      sous_departement_id: user.sous_departement_id,
      zone: user.zone,
      direction_provinciale_id: user.direction_provinciale_id,
      bureau_international_id: user.bureau_international_id,
      actif: user.actif,
      derniere_connexion: user.derniere_connexion
    };

    res.json({
      message: 'Utilisateur mis à jour avec succès',
      user: userResponse
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ 
      error: 'Failed to update user',
      message: 'Erreur lors de la mise à jour de l\'utilisateur'
    });
  }
});

// DELETE /api/users/:id - Delete user (temporarily allowing all authenticated users for testing)
router.delete('/:id', [
  // requireRole('Patron') // Temporarily commented for testing
], async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id);

    if (!user) {
      return res.status(404).json({ 
        error: 'User not found',
        message: 'Utilisateur non trouvé'
      });
    }

    // Prevent self-deletion
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ 
        error: 'Cannot delete yourself',
        message: 'Impossible de supprimer votre propre compte'
      });
    }

    await user.destroy();

    res.json({
      message: 'Utilisateur supprimé avec succès'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ 
      error: 'Failed to delete user',
      message: 'Erreur lors de la suppression de l\'utilisateur'
    });
  }
});

// POST /api/users/:id/activate - Activate user (temporarily allowing all authenticated users for testing)
router.post('/:id/activate', [
  // requireRole('Administrateur') // Temporarily commented for testing
], async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id);

    if (!user) {
      return res.status(404).json({ 
        error: 'User not found',
        message: 'Utilisateur non trouvé'
      });
    }

    user.actif = true;
    await user.save();

    res.json({
      message: 'Utilisateur activé avec succès',
      user: {
        id: user.id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role,
        telephone: user.telephone,
        actif: user.actif,
        derniere_connexion: user.derniere_connexion
      }
    });

  } catch (error) {
    console.error('Activate user error:', error);
    res.status(500).json({ 
      error: 'Failed to activate user',
      message: 'Erreur lors de l\'activation de l\'utilisateur'
    });
  }
});

// POST /api/users/:id/deactivate - Deactivate user (temporarily allowing all authenticated users for testing)
router.post('/:id/deactivate', [
  // requireRole('Administrateur') // Temporarily commented for testing
], async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id);

    if (!user) {
      return res.status(404).json({ 
        error: 'User not found',
        message: 'Utilisateur non trouvé'
      });
    }

    // Prevent self-deactivation
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ 
        error: 'Cannot deactivate yourself',
        message: 'Impossible de désactiver votre propre compte'
      });
    }

    user.actif = false;
    await user.save();

    res.json({
      message: 'Utilisateur désactivé avec succès',
      user: {
        id: user.id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role,
        telephone: user.telephone,
        actif: user.actif,
        derniere_connexion: user.derniere_connexion
      }
    });

  } catch (error) {
    console.error('Deactivate user error:', error);
    res.status(500).json({ 
      error: 'Failed to deactivate user',
      message: 'Erreur lors de la désactivation de l\'utilisateur'
    });
  }
});



module.exports = router; 
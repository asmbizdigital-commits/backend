const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Departement = require('../models/Departement');
const User = require('../models/User');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/departements/public-options — liste pour sélecteurs (soumissions besoins, etc.)
router.get('/public-options', async (req, res) => {
  try {
    const { Op } = require('sequelize');
    const limit = Math.min(parseInt(req.query.limit, 10) || 1000, 10000);
    const search = req.query.search;

    const whereClause = { statut: 'Actif' };
    if (search) {
      whereClause[Op.or] = [
        { nom: { [Op.like]: `%${search}%` } },
        { code: { [Op.like]: `%${search}%` } }
      ];
    }

    const departements = await Departement.findAll({
      attributes: ['id', 'nom', 'code', 'couleur', 'statut'],
      where: whereClause,
      order: [['nom', 'ASC']],
      limit
    });

    res.json({ success: true, data: departements });
  } catch (error) {
    console.error('Error fetching public department options:', error);
    res.status(500).json({ success: false, message: 'Erreur lors du chargement des départements' });
  }
});

// GET /api/departements - Get all departments with filtering
router.get('/', [
  query('statut').optional().isIn(['Actif', 'Inactif', 'En restructuration']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
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

    const { statut, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Build where clause
    const whereClause = {};
    if (statut) whereClause.statut = statut;

    const { count, rows: departements } = await Departement.findAndCountAll({
      where: whereClause,
      attributes: ['id', 'nom', 'code', 'description', 'responsable_id', 'budget_annuel', 'statut', 'couleur', 'date_creation'],
      include: [
        {
          model: User,
          as: 'Responsable',
          attributes: ['id', 'nom', 'prenom', 'email']
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['nom', 'ASC']]
    });

    res.json({
      departements,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({ 
      error: 'Failed to get departments',
      message: 'Erreur lors de la récupération des départements'
    });
  }
});

// GET /api/departements/:id - Get specific department
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const departement = await Departement.findByPk(id, {
      attributes: ['id', 'nom', 'code', 'description', 'responsable_id', 'budget_annuel', 'statut', 'couleur', 'date_creation'],
      include: [
        {
          model: User,
          as: 'Responsable',
          attributes: ['id', 'nom', 'prenom', 'email']
        }
      ]
    });

    if (!departement) {
      return res.status(404).json({ 
        error: 'Department not found',
        message: 'Département non trouvé'
      });
    }

    res.json({ departement });

  } catch (error) {
    console.error('Get department error:', error);
    res.status(500).json({ 
      error: 'Failed to get department',
      message: 'Erreur lors de la récupération du département'
    });
  }
});

// POST /api/departements - Create new department
router.post('/', [
  requireRole('Administrateur'),
  body('nom').isLength({ min: 1, max: 100 }),
  body('code').isLength({ min: 1, max: 10 }),
  body('description').optional().isLength({ max: 1000 }),
  body('responsable_id').optional().isInt(),
  body('budget_annuel').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    return !isNaN(parseFloat(value)) && parseFloat(value) >= 0;
  }),
  body('statut').isIn(['Actif', 'Inactif', 'En restructuration']),
  body('couleur').optional().matches(/^#[0-9A-F]{6}$/i)
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

    const departementData = req.body;
    
    // Check if department code already exists
    const existingDepartement = await Departement.findOne({ 
      where: { code: departementData.code }
    });

    if (existingDepartement) {
      return res.status(400).json({ 
        error: 'Department code already exists',
        message: 'Ce code de département existe déjà'
      });
    }

    // Check if responsable exists if provided
    if (departementData.responsable_id) {
      const responsable = await User.findByPk(departementData.responsable_id);
      if (!responsable) {
        return res.status(400).json({ 
          error: 'Responsable not found',
          message: 'Le responsable spécifié n\'existe pas'
        });
      }
    }

    const departement = await Departement.create(departementData);

    // Fetch the created department with responsable info
    const createdDepartement = await Departement.findByPk(departement.id, {
      include: [
        {
          model: User,
          as: 'Responsable',
          attributes: ['id', 'nom', 'prenom', 'email']
        }
      ]
    });

    res.status(201).json({
      message: 'Département créé avec succès',
      departement: createdDepartement
    });

  } catch (error) {
    console.error('Create department error:', error);
    res.status(500).json({ 
      error: 'Failed to create department',
      message: 'Erreur lors de la création du département'
    });
  }
});

// PUT /api/departements/:id - Update department
router.put('/:id', [
  requireRole('Administrateur'),
  body('nom').optional().isLength({ min: 1, max: 100 }),
  body('code').optional().isLength({ min: 1, max: 10 }),
  body('description').optional().isLength({ max: 1000 }),
  body('responsable_id').optional().isInt(),
  body('budget_annuel').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    return !isNaN(parseFloat(value)) && parseFloat(value) >= 0;
  }),
  body('statut').optional().isIn(['Actif', 'Inactif', 'En restructuration']),
  body('couleur').optional().matches(/^#[0-9A-F]{6}$/i)
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
    const departementData = req.body;

    const departement = await Departement.findByPk(id);
    if (!departement) {
      return res.status(404).json({ 
        error: 'Department not found',
        message: 'Département non trouvé'
      });
    }

    // Check if new code already exists (if code is being updated)
    if (departementData.code && departementData.code !== departement.code) {
      const existingDepartement = await Departement.findOne({ 
        where: { code: departementData.code }
      });

      if (existingDepartement) {
        return res.status(400).json({ 
          error: 'Department code already exists',
          message: 'Ce code de département existe déjà'
        });
      }
    }

    // Check if responsable exists if provided
    if (departementData.responsable_id) {
      const responsable = await User.findByPk(departementData.responsable_id);
      if (!responsable) {
        return res.status(400).json({ 
          error: 'Responsable not found',
          message: 'Le responsable spécifié n\'existe pas'
        });
      }
    }

    await departement.update(departementData);

    // Fetch the updated department with responsable info
    const updatedDepartement = await Departement.findByPk(id, {
      include: [
        {
          model: User,
          as: 'Responsable',
          attributes: ['id', 'nom', 'prenom', 'email']
        }
      ]
    });

    res.json({
      message: 'Département mis à jour avec succès',
      departement: updatedDepartement
    });

  } catch (error) {
    console.error('Update department error:', error);
    res.status(500).json({ 
      error: 'Failed to update department',
      message: 'Erreur lors de la mise à jour du département'
    });
  }
});

// DELETE /api/departements/:id - Delete department
router.delete('/:id', [
  requireRole('Administrateur')
], async (req, res) => {
  try {
    const { id } = req.params;
    const departement = await Departement.findByPk(id);

    if (!departement) {
      return res.status(404).json({ 
        error: 'Department not found',
        message: 'Département non trouvé'
      });
    }

    // Check if department can be deleted (no active users, etc.)
    // Add your business logic here if needed

    await departement.destroy();

    res.json({
      message: 'Département supprimé avec succès'
    });

  } catch (error) {
    console.error('Delete department error:', error);
    res.status(500).json({ 
      error: 'Failed to delete department',
      message: 'Erreur lors de la suppression du département'
    });
  }
});

// GET /api/departements/stats - Get department statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const totalDepartements = await Departement.count();
    const departementsActifs = await Departement.count({ where: { statut: 'Actif' } });
    const departementsInactifs = await Departement.count({ where: { statut: 'Inactif' } });
    const departementsRestructuration = await Departement.count({ where: { statut: 'En restructuration' } });

    const budgetTotal = await Departement.sum('budget_annuel', { 
      where: { 
        budget_annuel: { [require('sequelize').Op.not]: null } 
      } 
    });

    res.json({
      total: totalDepartements,
      actifs: departementsActifs,
      inactifs: departementsInactifs,
      restructuration: departementsRestructuration,
      budgetTotal: budgetTotal || 0
    });

  } catch (error) {
    console.error('Get department stats error:', error);
    res.status(500).json({ 
      error: 'Failed to get department stats',
      message: 'Erreur lors de la récupération des statistiques'
    });
  }
});

module.exports = router;

const express = require('express');
const { body, validationResult, query } = require('express-validator');
const AffectationChambre = require('../models/AffectationChambre');
const User = require('../models/User');
const Chambre = require('../models/Chambre');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/affectations - Get all assignments with filtering
router.get('/', [
  query('utilisateur_id').optional().isInt(),
  query('chambre_id').optional().isInt(),
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

    const { utilisateur_id, chambre_id, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Build where clause
    const whereClause = {};
    if (utilisateur_id) whereClause.utilisateur_id = utilisateur_id;
    if (chambre_id) whereClause.chambre_id = chambre_id;

    const { count, rows: affectations } = await AffectationChambre.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'utilisateur',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: Chambre,
          as: 'chambre',
          attributes: ['id', 'numero', 'type', 'statut']
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['date_affectation', 'DESC']]
    });

    // Format the response
    const formattedAffectations = affectations.map(affectation => ({
      id: affectation.id,
      utilisateur_id: affectation.utilisateur_id,
      chambre_id: affectation.chambre_id,
      date_affectation: affectation.date_affectation,
      remarque: affectation.remarque,
      utilisateur: affectation.utilisateur ? {
        id: affectation.utilisateur.id,
        nom: affectation.utilisateur.nom,
        prenom: affectation.utilisateur.prenom,
        nom_complet: `${affectation.utilisateur.prenom} ${affectation.utilisateur.nom}`
      } : null,
      chambre: affectation.chambre ? {
        id: affectation.chambre.id,
        numero: affectation.chambre.numero,
        type: affectation.chambre.type,
        statut: affectation.chambre.statut
      } : null
    }));

    res.json({
      affectations: formattedAffectations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get assignments error:', error);
    res.status(500).json({ 
      error: 'Failed to get assignments',
      message: 'Erreur lors de la récupération des affectations'
    });
  }
});

// GET /api/affectations/:id - Get specific assignment
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const affectation = await AffectationChambre.findByPk(id, {
      include: [
        {
          model: User,
          as: 'utilisateur',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: Chambre,
          as: 'chambre',
          attributes: ['id', 'numero', 'type', 'statut', 'prix_nuit']
        }
      ]
    });

    if (!affectation) {
      return res.status(404).json({ 
        error: 'Assignment not found',
        message: 'Affectation non trouvée'
      });
    }

    // Format the response
    const formattedAffectation = {
      id: affectation.id,
      utilisateur_id: affectation.utilisateur_id,
      chambre_id: affectation.chambre_id,
      date_affectation: affectation.date_affectation,
      remarque: affectation.remarque,
      utilisateur: affectation.utilisateur ? {
        id: affectation.utilisateur.id,
        nom: affectation.utilisateur.nom,
        prenom: affectation.utilisateur.prenom,
        nom_complet: `${affectation.utilisateur.prenom} ${affectation.utilisateur.nom}`
      } : null,
      chambre: affectation.chambre ? {
        id: affectation.chambre.id,
        numero: affectation.chambre.numero,
        type: affectation.chambre.type,
        statut: affectation.chambre.statut,
        prix_nuit: affectation.chambre.prix_nuit
      } : null
    };

    res.json({ affectation: formattedAffectation });

  } catch (error) {
    console.error('Get assignment error:', error);
    res.status(500).json({ 
      error: 'Failed to get assignment',
      message: 'Erreur lors de la récupération de l\'affectation'
    });
  }
});

// POST /api/affectations - Create new assignment
router.post('/', [
  requireRole('Superviseur', 'Administrateur', 'Patron'),
  body('utilisateur_id').isInt({ min: 1 }),
  body('chambre_id').isInt({ min: 1 }),
  body('date_affectation').optional().isISO8601(),
  body('remarque').optional().isLength({ max: 1000 })
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

    const affectationData = req.body;
    
    // Check if user exists
    const user = await User.findByPk(affectationData.utilisateur_id);
    if (!user) {
      return res.status(400).json({ 
        error: 'User not found',
        message: 'Utilisateur non trouvé'
      });
    }

    // Check if room exists
    const chambre = await Chambre.findByPk(affectationData.chambre_id);
    if (!chambre) {
      return res.status(400).json({ 
        error: 'Room not found',
        message: 'Chambre non trouvée'
      });
    }

    // Check if assignment already exists for this user and room
    const existingAffectation = await AffectationChambre.findOne({
      where: {
        utilisateur_id: affectationData.utilisateur_id,
        chambre_id: affectationData.chambre_id
      }
    });

    if (existingAffectation) {
      return res.status(400).json({ 
        error: 'Assignment already exists',
        message: 'Cette affectation existe déjà'
      });
    }

    const affectation = await AffectationChambre.create(affectationData);

    // Get the created assignment with relations
    const createdAffectation = await AffectationChambre.findByPk(affectation.id, {
      include: [
        {
          model: User,
          as: 'utilisateur',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: Chambre,
          as: 'chambre',
          attributes: ['id', 'numero', 'type', 'statut']
        }
      ]
    });

    res.status(201).json({
      message: 'Affectation créée avec succès',
      affectation: createdAffectation
    });

  } catch (error) {
    console.error('Create assignment error:', error);
    res.status(500).json({ 
      error: 'Failed to create assignment',
      message: 'Erreur lors de la création de l\'affectation'
    });
  }
});

// PUT /api/affectations/:id - Update assignment
router.put('/:id', [
  requireRole('Superviseur', 'Administrateur', 'Patron'),
  body('utilisateur_id').optional().isInt({ min: 1 }),
  body('chambre_id').optional().isInt({ min: 1 }),
  body('date_affectation').optional().isISO8601(),
  body('remarque').optional().isLength({ max: 1000 })
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
    const affectationData = req.body;

    const affectation = await AffectationChambre.findByPk(id);

    if (!affectation) {
      return res.status(404).json({ 
        error: 'Assignment not found',
        message: 'Affectation non trouvée'
      });
    }

    // Check if new user exists
    if (affectationData.utilisateur_id) {
      const user = await User.findByPk(affectationData.utilisateur_id);
      if (!user) {
        return res.status(400).json({ 
          error: 'User not found',
          message: 'Utilisateur non trouvé'
        });
      }
    }

    // Check if new room exists
    if (affectationData.chambre_id) {
      const chambre = await Chambre.findByPk(affectationData.chambre_id);
      if (!chambre) {
        return res.status(400).json({ 
          error: 'Room not found',
          message: 'Chambre non trouvée'
        });
      }
    }

    // Check if new assignment conflicts with existing one
    if (affectationData.utilisateur_id || affectationData.chambre_id) {
      const newUtilisateurId = affectationData.utilisateur_id || affectation.utilisateur_id;
      const newChambreId = affectationData.chambre_id || affectation.chambre_id;
      
      const existingAffectation = await AffectationChambre.findOne({
        where: {
          utilisateur_id: newUtilisateurId,
          chambre_id: newChambreId,
          id: { [require('sequelize').Op.ne]: id }
        }
      });

      if (existingAffectation) {
        return res.status(400).json({ 
          error: 'Assignment already exists',
          message: 'Cette affectation existe déjà'
        });
      }
    }

    await affectation.update(affectationData);

    // Get the updated assignment with relations
    const updatedAffectation = await AffectationChambre.findByPk(id, {
      include: [
        {
          model: User,
          as: 'utilisateur',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: Chambre,
          as: 'chambre',
          attributes: ['id', 'numero', 'type', 'statut']
        }
      ]
    });

    res.json({
      message: 'Affectation mise à jour avec succès',
      affectation: updatedAffectation
    });

  } catch (error) {
    console.error('Update assignment error:', error);
    res.status(500).json({ 
      error: 'Failed to update assignment',
      message: 'Erreur lors de la mise à jour de l\'affectation'
    });
  }
});

// DELETE /api/affectations/:id - Delete assignment
router.delete('/:id', [
  requireRole('Administrateur', 'Patron'),
], async (req, res) => {
  try {
    const { id } = req.params;
    const affectation = await AffectationChambre.findByPk(id);

    if (!affectation) {
      return res.status(404).json({ 
        error: 'Assignment not found',
        message: 'Affectation non trouvée'
      });
    }

    await affectation.destroy();

    res.json({
      message: 'Affectation supprimée avec succès'
    });

  } catch (error) {
    console.error('Delete assignment error:', error);
    res.status(500).json({ 
      error: 'Failed to delete assignment',
      message: 'Erreur lors de la suppression de l\'affectation'
    });
  }
});

// GET /api/affectations/stats/overview - Get assignment statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const totalAssignments = await AffectationChambre.count();
    const todayAssignments = await AffectationChambre.count({
      where: {
        date_affectation: {
          [require('sequelize').Op.gte]: new Date().setHours(0, 0, 0, 0)
        }
      }
    });

    // Get assignments by user
    const assignmentsByUser = await AffectationChambre.findAll({
      include: [
        {
          model: User,
          as: 'utilisateur',
          attributes: ['id', 'nom', 'prenom']
        }
      ],
      attributes: [
        'utilisateur_id',
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
      ],
      group: ['utilisateur_id'],
      order: [[require('sequelize').fn('COUNT', require('sequelize').col('id')), 'DESC']],
      limit: 5
    });

    // Get assignments by room type
    const assignmentsByRoomType = await AffectationChambre.findAll({
      include: [
        {
          model: Chambre,
          as: 'chambre',
          attributes: ['type']
        }
      ],
      attributes: [
        'chambre_id',
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
      ],
      group: ['chambre_id'],
      order: [[require('sequelize').fn('COUNT', require('sequelize').col('id')), 'DESC']],
      limit: 5
    });

    res.json({
      stats: {
        total: totalAssignments,
        today: todayAssignments
      },
      assignmentsByUser,
      assignmentsByRoomType
    });

  } catch (error) {
    console.error('Get assignment stats error:', error);
    res.status(500).json({ 
      error: 'Failed to get assignment statistics',
      message: 'Erreur lors de la récupération des statistiques'
    });
  }
});

module.exports = router; 
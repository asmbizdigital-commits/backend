const express = require('express');
const { body, validationResult } = require('express-validator');
const { Gratification, Employe } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { canReadEmployeData, denyEmployeAccess } = require('../utils/employeAccess');

const router = express.Router();

// Validation rules
const gratificationValidation = [
  body('employe_id').isInt({ min: 1 }).withMessage('ID employé invalide'),
  body('type_gratification').isIn(['prime', 'bonus', 'commission', 'gratification_exceptionnelle', 'prime_performance', 'prime_anciennete']).withMessage('Type de gratification invalide'),
  body('montant').isFloat({ min: 0.01 }).withMessage('Montant invalide - doit être un nombre positif'),
  body('motif').isLength({ min: 1, max: 500 }).withMessage('Motif requis (max 500 caractères)'),
  body('description').optional().isLength({ max: 1000 }).withMessage('Description trop longue'),
  body('date_gratification').isISO8601().withMessage('Date de gratification invalide'),
  body('periode').optional().isLength({ max: 100 }).withMessage('Période trop longue'),
  body('statut').optional().isIn(['actif', 'annule', 'suspendu']).withMessage('Statut invalide'),
  body('gratification_par').optional().isInt({ min: 1 }).withMessage('ID gratification_par invalide')
];

// GET /api/gratifications - Récupérer toutes les gratifications
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, type_gratification, statut, employe_id } = req.query;
    const offset = (page - 1) * limit;
    
    const whereClause = {};
    if (type_gratification) whereClause.type_gratification = type_gratification;
    if (statut) whereClause.statut = statut;
    if (employe_id) whereClause.employe_id = employe_id;
    
    const gratifications = await Gratification.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Employe,
          as: 'employe',
          attributes: ['id', 'nom_famille', 'prenoms', 'email_personnel']
        },
        {
          model: Employe,
          as: 'gratificationPar',
          attributes: ['id', 'nom_famille', 'prenoms']
        }
      ],
      order: [['date_gratification', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    res.json({
      success: true,
      data: gratifications.rows,
      pagination: {
        total: gratifications.count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(gratifications.count / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des gratifications:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des gratifications',
      error: error.message
    });
  }
});

// GET /api/gratifications/employe/:employe_id - Récupérer les gratifications d'un employé
router.get('/employe/:employe_id', authenticateToken, async (req, res) => {
  try {
    if (!(await canReadEmployeData(req.user, req.params.employe_id))) {
      return denyEmployeAccess(res);
    }

    const { employe_id } = req.params;
    const { statut } = req.query;
    
    const whereClause = { employe_id };
    if (statut) whereClause.statut = statut;
    
    const gratifications = await Gratification.findAll({
      where: whereClause,
      include: [
        {
          model: Employe,
          as: 'employe',
          attributes: ['id', 'nom_famille', 'prenoms', 'email_personnel']
        },
        {
          model: Employe,
          as: 'gratificationPar',
          attributes: ['id', 'nom_famille', 'prenoms']
        }
      ],
      order: [['date_gratification', 'DESC']]
    });
    
    res.json({
      success: true,
      data: gratifications
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des gratifications de l\'employé:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des gratifications',
      error: error.message
    });
  }
});

// GET /api/gratifications/stats - Statistiques des gratifications
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const { employe_id, type_gratification, date_debut, date_fin } = req.query;
    
    const whereClause = {};
    if (employe_id) whereClause.employe_id = employe_id;
    if (type_gratification) whereClause.type_gratification = type_gratification;
    if (date_debut && date_fin) {
      whereClause.date_gratification = {
        [Op.between]: [date_debut, date_fin]
      };
    }
    
    const stats = await Gratification.findAll({
      where: whereClause,
      attributes: [
        'type_gratification',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('montant')), 'total_montant'],
        [sequelize.fn('AVG', sequelize.col('montant')), 'moyenne_montant']
      ],
      group: ['type_gratification']
    });
    
    const totalGratifications = await Gratification.count({ where: whereClause });
    const totalMontant = await Gratification.sum('montant', { where: whereClause });
    
    res.json({
      success: true,
      data: {
        stats,
        totalGratifications,
        totalMontant: totalMontant || 0
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des statistiques',
      error: error.message
    });
  }
});

// GET /api/gratifications/:id - Récupérer une gratification par ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const gratification = await Gratification.findByPk(id, {
      include: [
        {
          model: Employe,
          as: 'employe',
          attributes: ['id', 'nom_famille', 'prenoms', 'email_personnel']
        },
        {
          model: Employe,
          as: 'gratificationPar',
          attributes: ['id', 'nom_famille', 'prenoms']
        }
      ]
    });
    
    if (!gratification) {
      return res.status(404).json({
        success: false,
        message: 'Gratification non trouvée'
      });
    }

    if (!(await canReadEmployeData(req.user, gratification.employe_id))) {
      return denyEmployeAccess(res);
    }
    
    res.json({
      success: true,
      data: gratification
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de la gratification:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération de la gratification',
      error: error.message
    });
  }
});

// POST /api/gratifications - Créer une nouvelle gratification
router.post('/', authenticateToken, gratificationValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Données invalides',
        errors: errors.array()
      });
    }
    
    const {
      employe_id,
      type_gratification,
      montant,
      motif,
      description,
      date_gratification,
      periode,
      statut = 'actif',
      gratification_par
    } = req.body;
    
    // Vérifier que l'employé existe
    const employe = await Employe.findByPk(employe_id);
    if (!employe) {
      return res.status(404).json({
        success: false,
        message: 'Employé non trouvé'
      });
    }
    
    // Vérifier que gratification_par existe si fourni
    if (gratification_par) {
      const gratificationPar = await Employe.findByPk(gratification_par);
      if (!gratificationPar) {
        return res.status(404).json({
          success: false,
          message: 'Employé gratification_par non trouvé'
        });
      }
    }
    
    const gratification = await Gratification.create({
      employe_id,
      type_gratification,
      montant,
      motif,
      description,
      date_gratification,
      periode,
      statut,
      gratification_par: gratification_par || null
    });
    
    // Récupérer la gratification créée avec les relations
    const createdGratification = await Gratification.findByPk(gratification.id, {
      include: [
        {
          model: Employe,
          as: 'employe',
          attributes: ['id', 'nom_famille', 'prenoms', 'email_personnel']
        },
        {
          model: Employe,
          as: 'gratificationPar',
          attributes: ['id', 'nom_famille', 'prenoms']
        }
      ]
    });
    
    res.status(201).json({
      success: true,
      message: 'Gratification créée avec succès',
      data: createdGratification
    });
  } catch (error) {
    console.error('Erreur lors de la création de la gratification:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la création de la gratification',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// PUT /api/gratifications/:id - Mettre à jour une gratification
router.put('/:id', authenticateToken, gratificationValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Données invalides',
        errors: errors.array()
      });
    }
    
    const { id } = req.params;
    const {
      employe_id,
      type_gratification,
      montant,
      motif,
      description,
      date_gratification,
      periode,
      statut,
      gratification_par
    } = req.body;
    
    const gratification = await Gratification.findByPk(id);
    if (!gratification) {
      return res.status(404).json({
        success: false,
        message: 'Gratification non trouvée'
      });
    }
    
    // Vérifier que l'employé existe
    if (employe_id) {
      const employe = await Employe.findByPk(employe_id);
      if (!employe) {
        return res.status(404).json({
          success: false,
          message: 'Employé non trouvé'
        });
      }
    }
    
    // Vérifier que gratification_par existe si fourni
    if (gratification_par) {
      const gratificationPar = await Employe.findByPk(gratification_par);
      if (!gratificationPar) {
        return res.status(404).json({
          success: false,
          message: 'Employé gratification_par non trouvé'
        });
      }
    }
    
    await gratification.update({
      employe_id: employe_id || gratification.employe_id,
      type_gratification: type_gratification || gratification.type_gratification,
      montant: montant || gratification.montant,
      motif: motif || gratification.motif,
      description: description !== undefined ? description : gratification.description,
      date_gratification: date_gratification || gratification.date_gratification,
      periode: periode !== undefined ? periode : gratification.periode,
      statut: statut || gratification.statut,
      gratification_par: gratification_par || gratification.gratification_par
    });
    
    // Récupérer la gratification mise à jour avec les relations
    const updatedGratification = await Gratification.findByPk(id, {
      include: [
        {
          model: Employe,
          as: 'employe',
          attributes: ['id', 'nom_famille', 'prenoms', 'email_personnel']
        },
        {
          model: Employe,
          as: 'gratificationPar',
          attributes: ['id', 'nom_famille', 'prenoms']
        }
      ]
    });
    
    res.json({
      success: true,
      message: 'Gratification mise à jour avec succès',
      data: updatedGratification
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la gratification:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la mise à jour de la gratification',
      error: error.message
    });
  }
});

// DELETE /api/gratifications/:id - Supprimer une gratification
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const gratification = await Gratification.findByPk(id);
    if (!gratification) {
      return res.status(404).json({
        success: false,
        message: 'Gratification non trouvée'
      });
    }
    
    await gratification.destroy();
    
    res.json({
      success: true,
      message: 'Gratification supprimée avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression de la gratification:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la suppression de la gratification',
      error: error.message
    });
  }
});

// PATCH /api/gratifications/:id/status - Mettre à jour le statut d'une gratification
router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;
    
    if (!statut || !['actif', 'annule', 'suspendu'].includes(statut)) {
      return res.status(400).json({
        success: false,
        message: 'Statut invalide'
      });
    }
    
    const gratification = await Gratification.findByPk(id);
    if (!gratification) {
      return res.status(404).json({
        success: false,
        message: 'Gratification non trouvée'
      });
    }
    
    await gratification.update({ statut });
    
    res.json({
      success: true,
      message: 'Statut de la gratification mis à jour avec succès',
      data: { id: gratification.id, statut }
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du statut:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la mise à jour du statut',
      error: error.message
    });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const Sanction = require('../models/Sanction');
const { authenticateToken } = require('../middleware/auth');
const { canReadEmployeData, denyEmployeAccess } = require('../utils/employeAccess');

// GET /api/sanctions - Récupérer toutes les sanctions
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { employe_id, type, statut, date_debut, date_fin, search } = req.query;
    
    let whereClause = {};
    
    if (employe_id) {
      whereClause.employe_id = employe_id;
    }
    
    if (type) {
      whereClause.type = type;
    }
    
    if (statut) {
      whereClause.statut = statut;
    }

    // Filtrage par date
    if (date_debut || date_fin) {
      whereClause.date_sanction = {};
      if (date_debut) whereClause.date_sanction[Op.gte] = date_debut;
      if (date_fin) whereClause.date_sanction[Op.lte] = date_fin;
    }

    const sanctions = await Sanction.findAll({
      where: whereClause,
      order: [['date_sanction', 'DESC'], ['created_at', 'DESC']]
    });

    // Filtrage par recherche si fourni
    let filteredSanctions = sanctions;
    if (search) {
      const searchTerm = search.toLowerCase();
      filteredSanctions = sanctions.filter(sanction => 
        sanction.motif.toLowerCase().includes(searchTerm) ||
        (sanction.description && sanction.description.toLowerCase().includes(searchTerm))
      );
    }
    
    res.json({
      success: true,
      data: filteredSanctions,
      count: filteredSanctions.length
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des sanctions:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des sanctions'
    });
  }
});

// GET /api/sanctions/stats - Récupérer les statistiques des sanctions
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const totalSanctions = await Sanction.count();
    const avertissements = await Sanction.count({ where: { type: 'avertissement' } });
    const blames = await Sanction.count({ where: { type: 'blame' } });
    const misesAPied = await Sanction.count({ where: { type: 'mise_a_pied' } });
    const licenciements = await Sanction.count({ where: { type: 'licenciement' } });
    const actives = await Sanction.count({ where: { statut: 'actif' } });
    const annulees = await Sanction.count({ where: { statut: 'annule' } });
    const suspendues = await Sanction.count({ where: { statut: 'suspendu' } });

    res.json({
      success: true,
      data: {
        total: totalSanctions,
        par_type: {
          avertissements,
          blames,
          misesAPied,
          licenciements
        },
        par_statut: {
          actives,
          annulees,
          suspendues
        }
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des statistiques'
    });
  }
});

// GET /api/sanctions/employe/:employe_id - Récupérer toutes les sanctions d'un employé
router.get('/employe/:employe_id', authenticateToken, async (req, res) => {
  try {
    if (!(await canReadEmployeData(req.user, req.params.employe_id))) {
      return denyEmployeAccess(res);
    }

    const sanctions = await Sanction.findAll({
      where: { 
        employe_id: req.params.employe_id
      },
      order: [['date_sanction', 'DESC'], ['created_at', 'DESC']]
    });
    
    res.json({
      success: true,
      data: sanctions,
      count: sanctions.length
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des sanctions de l\'employé:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des sanctions de l\'employé'
    });
  }
});

// GET /api/sanctions/:id - Récupérer une sanction par ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const sanction = await Sanction.findByPk(req.params.id);
    
    if (!sanction) {
      return res.status(404).json({
        success: false,
        message: 'Sanction non trouvée'
      });
    }

    if (!(await canReadEmployeData(req.user, sanction.employe_id))) {
      return denyEmployeAccess(res);
    }
    
    res.json({
      success: true,
      data: sanction
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de la sanction:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération de la sanction'
    });
  }
});

// POST /api/sanctions - Créer une nouvelle sanction
router.post('/', [
  authenticateToken,
  body('employe_id').isInt({ min: 1 }).withMessage('ID employé invalide'),
  body('type').isIn(['avertissement', 'blame', 'mise_a_pied', 'licenciement']).withMessage('Type de sanction invalide'),
  body('motif').isLength({ min: 5, max: 1000 }).withMessage('Le motif doit contenir entre 5 et 1000 caractères'),
  body('description').optional().isLength({ max: 2000 }).withMessage('La description ne doit pas dépasser 2000 caractères'),
  body('date_sanction').isISO8601().withMessage('Format de date invalide'),
  body('duree').optional().isLength({ max: 100 }).withMessage('La durée ne doit pas dépasser 100 caractères'),
  body('montant_amende').optional().isFloat({ min: 0 }).withMessage('Le montant de l\'amende doit être positif'),
  body('statut').optional().isIn(['actif', 'annule', 'suspendu']).withMessage('Le statut doit être "actif", "annule" ou "suspendu"'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Données de validation invalides',
        errors: errors.array()
      });
    }

    const sanctionData = {
      ...req.body,
      employe_id: parseInt(req.body.employe_id),
      sanction_par: req.user.id // L'utilisateur connecté applique la sanction
    };

    // Vérifier que la date de sanction n'est pas dans le futur
    const dateSanction = new Date(req.body.date_sanction);
    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);
    
    if (dateSanction > aujourdhui) {
      return res.status(400).json({
        success: false,
        message: 'La date de sanction ne peut pas être dans le futur'
      });
    }

    const newSanction = await Sanction.create(sanctionData);
    
    res.status(201).json({
      success: true,
      message: 'Sanction créée avec succès',
      data: newSanction
    });
  } catch (error) {
    console.error('Erreur lors de la création de la sanction:', error);
    
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(400).json({
        success: false,
        message: 'L\'employé spécifié n\'existe pas'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la création de la sanction'
    });
  }
});

// PUT /api/sanctions/:id - Mettre à jour une sanction
router.put('/:id', [
  authenticateToken,
  body('type').optional().isIn(['avertissement', 'blame', 'mise_a_pied', 'licenciement']).withMessage('Type de sanction invalide'),
  body('motif').optional().isLength({ min: 5, max: 1000 }).withMessage('Le motif doit contenir entre 5 et 1000 caractères'),
  body('description').optional().isLength({ max: 2000 }).withMessage('La description ne doit pas dépasser 2000 caractères'),
  body('date_sanction').optional().isISO8601().withMessage('Format de date invalide'),
  body('duree').optional().isLength({ max: 100 }).withMessage('La durée ne doit pas dépasser 100 caractères'),
  body('montant_amende').optional().isFloat({ min: 0 }).withMessage('Le montant de l\'amende doit être positif'),
  body('statut').optional().isIn(['actif', 'annule', 'suspendu']).withMessage('Le statut doit être "actif", "annule" ou "suspendu"'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Données de validation invalides',
        errors: errors.array()
      });
    }

    // Vérifier si la sanction existe
    const existingSanction = await Sanction.findByPk(req.params.id);
    if (!existingSanction) {
      return res.status(404).json({
        success: false,
        message: 'Sanction non trouvée'
      });
    }

    // Mettre à jour seulement les champs fournis
    const updateData = {};
    const allowedFields = [
      'type', 'motif', 'description', 'date_sanction',
      'duree', 'montant_amende', 'statut'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    await existingSanction.update(updateData);
    
    // Récupérer la sanction mise à jour
    const updatedSanction = await Sanction.findByPk(req.params.id);
    
    res.json({
      success: true,
      message: 'Sanction mise à jour avec succès',
      data: updatedSanction
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la sanction:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la mise à jour de la sanction'
    });
  }
});

// DELETE /api/sanctions/:id - Supprimer une sanction
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    // Vérifier si la sanction existe
    const existingSanction = await Sanction.findByPk(req.params.id);
    if (!existingSanction) {
      return res.status(404).json({
        success: false,
        message: 'Sanction non trouvée'
      });
    }

    await existingSanction.destroy();
    
    res.json({
      success: true,
      message: 'Sanction supprimée avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression de la sanction:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la suppression de la sanction'
    });
  }
});

// PATCH /api/sanctions/:id/statut - Changer le statut d'une sanction
router.patch('/:id/statut', [
  authenticateToken,
  body('statut').isIn(['actif', 'annule', 'suspendu']).withMessage('Le statut doit être "actif", "annule" ou "suspendu"')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Données de validation invalides',
        errors: errors.array()
      });
    }

    const sanction = await Sanction.findByPk(req.params.id);
    if (!sanction) {
      return res.status(404).json({
        success: false,
        message: 'Sanction non trouvée'
      });
    }

    await sanction.update({ statut: req.body.statut });
    
    res.json({
      success: true,
      message: `Statut de la sanction mis à jour à "${req.body.statut}"`,
      data: sanction
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du statut:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la mise à jour du statut'
    });
  }
});

module.exports = router;

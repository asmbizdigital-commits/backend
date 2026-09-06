const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { Dependant, Employe } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { canReadEmployeData, denyEmployeAccess } = require('../utils/employeAccess');

// Middleware pour valider les données de dépendant
const validateDependantData = (req, res, next) => {
  const requiredFields = ['employe_id', 'nom', 'prenom', 'type'];
  const missingFields = requiredFields.filter(field => !req.body[field]);
  
  if (missingFields.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Champs obligatoires manquants: ${missingFields.join(', ')}`
    });
  }

  // Validation de l'email si fourni
  if (req.body.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(req.body.email)) {
      return res.status(400).json({
        success: false,
        message: 'Format d\'email invalide'
      });
    }
  }

  // Validation du type
  if (!['conjoint', 'enfant'].includes(req.body.type)) {
    return res.status(400).json({
      success: false,
      message: 'Le type doit être "conjoint" ou "enfant"'
    });
  }

  // Validation de la date de naissance si fournie
  if (req.body.date_naissance) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(req.body.date_naissance)) {
      return res.status(400).json({
        success: false,
        message: 'Format de date invalide (YYYY-MM-DD)'
      });
    }
  }

  next();
};

// GET /api/dependants - Récupérer tous les dépendants
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { employe_id, type, statut, search } = req.query;
    
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

    const dependants = await Dependant.findAll({
      where: whereClause,
      order: [['nom', 'ASC'], ['prenom', 'ASC']]
    });

    // Filtrage par recherche si fourni
    let filteredDependants = dependants;
    if (search) {
      const searchTerm = search.toLowerCase();
      filteredDependants = dependants.filter(dependant => 
        dependant.nom.toLowerCase().includes(searchTerm) ||
        dependant.prenom.toLowerCase().includes(searchTerm) ||
        (dependant.email && dependant.email.toLowerCase().includes(searchTerm))
      );
    }
    
    res.json({
      success: true,
      data: filteredDependants,
      count: filteredDependants.length
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des dépendants:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des dépendants'
    });
  }
});

// GET /api/dependants/stats - Récupérer les statistiques des dépendants
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const totalDependants = await Dependant.count();
    const conjoints = await Dependant.count({ where: { type: 'conjoint' } });
    const enfants = await Dependant.count({ where: { type: 'enfant' } });
    const actifs = await Dependant.count({ where: { statut: 'actif' } });
    const inactifs = await Dependant.count({ where: { statut: 'inactif' } });

    res.json({
      success: true,
      data: {
        total: totalDependants,
        conjoints,
        enfants,
        actifs,
        inactifs
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

// GET /api/dependants/employe/:employe_id - Récupérer tous les dépendants d'un employé
router.get('/employe/:employe_id', authenticateToken, async (req, res) => {
  try {
    if (!(await canReadEmployeData(req.user, req.params.employe_id))) {
      return denyEmployeAccess(res);
    }

    const dependants = await Dependant.findAll({
      where: { 
        employe_id: req.params.employe_id,
        statut: 'actif'
      },
      order: [['type', 'ASC'], ['nom', 'ASC'], ['prenom', 'ASC']]
    });
    
    res.json({
      success: true,
      data: dependants,
      count: dependants.length
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des dépendants de l\'employé:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des dépendants de l\'employé'
    });
  }
});

// GET /api/dependants/:id - Récupérer un dépendant par ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const dependant = await Dependant.findByPk(req.params.id);
    
    if (!dependant) {
      return res.status(404).json({
        success: false,
        message: 'Dépendant non trouvé'
      });
    }

    if (!(await canReadEmployeData(req.user, dependant.employe_id))) {
      return denyEmployeAccess(res);
    }
    
    res.json({
      success: true,
      data: dependant
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du dépendant:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération du dépendant'
    });
  }
});

// POST /api/dependants - Créer un nouveau dépendant
router.post('/', [
  authenticateToken,
  body('employe_id').isInt({ min: 1 }).withMessage('ID employé invalide'),
  body('nom').isLength({ min: 1, max: 100 }).withMessage('Le nom doit contenir entre 1 et 100 caractères'),
  body('prenom').isLength({ min: 1, max: 100 }).withMessage('Le prénom doit contenir entre 1 et 100 caractères'),
  body('type').isIn(['conjoint', 'enfant']).withMessage('Le type doit être "conjoint" ou "enfant"'),
  body('date_naissance').optional().isISO8601().withMessage('Format de date invalide'),
  body('lien_parente').optional().isLength({ max: 50 }).withMessage('Le lien de parenté ne doit pas dépasser 50 caractères'),
  body('telephone').optional().isLength({ max: 20 }).withMessage('Le téléphone ne doit pas dépasser 20 caractères'),
  body('email').optional().isEmail().withMessage('Format d\'email invalide'),
  body('adresse').optional().isLength({ max: 1000 }).withMessage('L\'adresse ne doit pas dépasser 1000 caractères'),
  body('ville').optional().isLength({ max: 100 }).withMessage('La ville ne doit pas dépasser 100 caractères'),
  body('code_postal').optional().isLength({ max: 10 }).withMessage('Le code postal ne doit pas dépasser 10 caractères'),
  body('pays').optional().isLength({ max: 100 }).withMessage('Le pays ne doit pas dépasser 100 caractères'),
  body('statut').optional().isIn(['actif', 'inactif']).withMessage('Le statut doit être "actif" ou "inactif"')
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

    const dependantData = {
      ...req.body,
      employe_id: parseInt(req.body.employe_id)
    };

    const newDependant = await Dependant.create(dependantData);
    
    res.status(201).json({
      success: true,
      message: 'Dépendant créé avec succès',
      data: newDependant
    });
  } catch (error) {
    console.error('Erreur lors de la création du dépendant:', error);
    
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(400).json({
        success: false,
        message: 'L\'employé spécifié n\'existe pas'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la création du dépendant'
    });
  }
});

// PUT /api/dependants/:id - Mettre à jour un dépendant
router.put('/:id', [
  authenticateToken,
  body('nom').optional().isLength({ min: 1, max: 100 }).withMessage('Le nom doit contenir entre 1 et 100 caractères'),
  body('prenom').optional().isLength({ min: 1, max: 100 }).withMessage('Le prénom doit contenir entre 1 et 100 caractères'),
  body('type').optional().isIn(['conjoint', 'enfant']).withMessage('Le type doit être "conjoint" ou "enfant"'),
  body('date_naissance').optional().isISO8601().withMessage('Format de date invalide'),
  body('lien_parente').optional().isLength({ max: 50 }).withMessage('Le lien de parenté ne doit pas dépasser 50 caractères'),
  body('telephone').optional().isLength({ max: 20 }).withMessage('Le téléphone ne doit pas dépasser 20 caractères'),
  body('email').optional().isEmail().withMessage('Format d\'email invalide'),
  body('adresse').optional().isLength({ max: 1000 }).withMessage('L\'adresse ne doit pas dépasser 1000 caractères'),
  body('ville').optional().isLength({ max: 100 }).withMessage('La ville ne doit pas dépasser 100 caractères'),
  body('code_postal').optional().isLength({ max: 10 }).withMessage('Le code postal ne doit pas dépasser 10 caractères'),
  body('pays').optional().isLength({ max: 100 }).withMessage('Le pays ne doit pas dépasser 100 caractères'),
  body('statut').optional().isIn(['actif', 'inactif']).withMessage('Le statut doit être "actif" ou "inactif"')
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

    // Vérifier si le dépendant existe
    const existingDependant = await Dependant.findByPk(req.params.id);
    if (!existingDependant) {
      return res.status(404).json({
        success: false,
        message: 'Dépendant non trouvé'
      });
    }

    // Mettre à jour seulement les champs fournis
    const updateData = {};
    const allowedFields = [
      'nom', 'prenom', 'type', 'date_naissance', 'lien_parente',
      'telephone', 'email', 'adresse', 'ville', 'code_postal', 'pays', 'statut'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    await existingDependant.update(updateData);
    
    // Récupérer le dépendant mis à jour
    const updatedDependant = await Dependant.findByPk(req.params.id);
    
    res.json({
      success: true,
      message: 'Dépendant mis à jour avec succès',
      data: updatedDependant
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du dépendant:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la mise à jour du dépendant'
    });
  }
});

// DELETE /api/dependants/:id - Supprimer un dépendant
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    // Vérifier si le dépendant existe
    const existingDependant = await Dependant.findByPk(req.params.id);
    if (!existingDependant) {
      return res.status(404).json({
        success: false,
        message: 'Dépendant non trouvé'
      });
    }

    await existingDependant.destroy();
    
    res.json({
      success: true,
      message: 'Dépendant supprimé avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression du dépendant:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la suppression du dépendant'
    });
  }
});

// PATCH /api/dependants/:id/statut - Changer le statut d'un dépendant
router.patch('/:id/statut', [
  authenticateToken,
  body('statut').isIn(['actif', 'inactif']).withMessage('Le statut doit être "actif" ou "inactif"')
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

    const dependant = await Dependant.findByPk(req.params.id);
    if (!dependant) {
      return res.status(404).json({
        success: false,
        message: 'Dépendant non trouvé'
      });
    }

    await dependant.update({ statut: req.body.statut });
    
    res.json({
      success: true,
      message: `Statut du dépendant mis à jour à "${req.body.statut}"`,
      data: dependant
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

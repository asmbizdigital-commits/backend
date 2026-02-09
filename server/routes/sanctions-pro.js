const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { authenticateToken, requireRole } = require('../middleware/auth');
const SanctionPro = require('../models/SanctionPro');
const { User, Employe } = require('../models');

// GET /api/sanctions-pro - Récupérer toutes les demandes de sanctions
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      statut, 
      type_sanction, 
      employe_id,
      demandeur_id,
      date_debut,
      date_fin,
      search 
    } = req.query;
    
    const offset = (page - 1) * limit;
    const where = {};
    
    if (statut) where.statut = statut;
    if (type_sanction) where.type_sanction = type_sanction;
    if (employe_id) where.employe_id = employe_id;
    if (demandeur_id) where.demandeur_id = demandeur_id;
    
    // Filtrage par date
    if (date_debut || date_fin) {
      where.date_incident = {};
      if (date_debut) where.date_incident[Op.gte] = date_debut;
      if (date_fin) where.date_incident[Op.lte] = date_fin;
    }
    
    // Déterminer les rôles qui peuvent voir toutes les demandes
    const canViewAll = ['Patron', 'Administrateur', 'Superviseur RH', 'Auditeur'].includes(req.user.role);
    
    // Si l'utilisateur n'est pas dans les rôles autorisés, ne montrer que ses demandes
    if (!canViewAll) {
      where.demandeur_id = req.user.id;
    }
    
    const { count, rows: sanctions } = await SanctionPro.findAndCountAll({
      where,
      include: [
        {
          model: Employe,
          as: 'employe',
          attributes: ['id', 'nom_famille', 'nom_usage', 'prenoms', 'matricule']
        },
        {
          model: User,
          as: 'demandeur',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: User,
          as: 'validateur',
          attributes: ['id', 'nom', 'prenom']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    // Filtrage par recherche si fourni
    let filteredSanctions = sanctions;
    if (search) {
      const searchTerm = search.toLowerCase();
      filteredSanctions = sanctions.filter(sanction => {
        const employeNom = sanction.employe 
          ? `${sanction.employe.prenoms} ${sanction.employe.nom_famille}`.toLowerCase()
          : '';
        return (
          sanction.motif.toLowerCase().includes(searchTerm) ||
          (sanction.description && sanction.description.toLowerCase().includes(searchTerm)) ||
          employeNom.includes(searchTerm)
        );
      });
    }
    
    res.json({
      success: true,
      data: filteredSanctions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des sanctions:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des sanctions'
    });
  }
});

// GET /api/sanctions-pro/stats - Récupérer les statistiques
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const where = {};
    
    // Déterminer les rôles qui peuvent voir toutes les statistiques
    const canViewAll = ['Patron', 'Administrateur', 'Superviseur RH', 'Auditeur'].includes(req.user.role);
    
    if (!canViewAll) {
      where.demandeur_id = req.user.id;
    }
    
    const total = await SanctionPro.count({ where });
    
    const parType = await SanctionPro.findAll({
      attributes: [
        'type_sanction',
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
      ],
      where,
      group: ['type_sanction'],
      raw: true
    });
    
    const parStatut = await SanctionPro.findAll({
      attributes: [
        'statut',
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
      ],
      where,
      group: ['statut'],
      raw: true
    });
    
    const statsParType = {};
    parType.forEach(item => {
      statsParType[item.type_sanction] = parseInt(item.count);
    });
    
    const statsParStatut = {};
    parStatut.forEach(item => {
      statsParStatut[item.statut] = parseInt(item.count);
    });
    
    res.json({
      success: true,
      data: {
        total,
        par_type: statsParType,
        par_statut: statsParStatut
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

// GET /api/sanctions-pro/:id - Récupérer une demande de sanction spécifique
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const sanction = await SanctionPro.findByPk(req.params.id, {
      include: [
        {
          model: Employe,
          as: 'employe',
          attributes: ['id', 'nom_famille', 'nom_usage', 'prenoms', 'matricule', 'poste', 'departement_id']
        },
        {
          model: User,
          as: 'demandeur',
          attributes: ['id', 'nom', 'prenom', 'email', 'departement_id', 'sous_departement_id']
        },
        {
          model: User,
          as: 'validateur',
          attributes: ['id', 'nom', 'prenom', 'email']
        }
      ]
    });
    
    if (!sanction) {
      return res.status(404).json({
        success: false,
        message: 'Demande de sanction non trouvée'
      });
    }
    
    // Vérifier les permissions
    const canViewAll = ['Patron', 'Administrateur', 'Superviseur RH', 'Auditeur'].includes(req.user.role);
    if (!canViewAll && sanction.demandeur_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'avez pas accès à cette demande'
      });
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

// POST /api/sanctions-pro - Créer une nouvelle demande de sanction (Superviseur uniquement)
router.post('/', 
  authenticateToken,
  requireRole(['Superviseur', 'Patron', 'Administrateur']),
  [
    body('employe_id').isInt({ min: 1 }).withMessage('L\'ID de l\'employé est requis'),
    body('type_sanction').isIn(['avertissement_verbal', 'avertissement_ecrit', 'blame', 'mise_a_pied', 'retrogradation', 'licenciement_faute_grave']).withMessage('Type de sanction invalide'),
    body('motif').trim().isLength({ min: 10, max: 2000 }).withMessage('Le motif doit contenir entre 10 et 2000 caractères'),
    body('date_incident').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date d\'incident invalide (format attendu: AAAA-MM-JJ)'),
    body('duree_suspension').optional({ nullable: true }).isInt({ min: 1, max: 8 }).withMessage('La durée de suspension doit être entre 1 et 8 jours'),
    body('date_debut_suspension').optional({ nullable: true }).matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date de début invalide'),
    body('montant_amende').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Le montant de l\'amende doit être positif')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const errArray = errors.array();
        const firstMsg = errArray[0]?.msg || errArray[0]?.message || 'Données invalides';
        return res.status(400).json({
          success: false,
          message: firstMsg,
          errors: errArray
        });
      }

      // Aucune vérification "date dans le futur" pour date_incident — toute date est acceptée.

      // Vérifier que l'employé existe
      const employe = await Employe.findByPk(req.body.employe_id);
      if (!employe) {
        return res.status(404).json({
          success: false,
          message: 'Employé non trouvé'
        });
      }
      
      const sanctionData = {
        ...req.body,
        demandeur_id: req.user.id,
        statut: 'en_attente'
      };
      
      // Calculer la date de fin de suspension si nécessaire
      if (sanctionData.type_sanction === 'mise_a_pied' && sanctionData.duree_suspension && sanctionData.date_debut_suspension) {
        const dateDebut = new Date(sanctionData.date_debut_suspension);
        const dateFin = new Date(dateDebut);
        dateFin.setDate(dateFin.getDate() + sanctionData.duree_suspension);
        sanctionData.date_fin_suspension = dateFin.toISOString().split('T')[0];
      }
      
      const nouvelleSanction = await SanctionPro.create(sanctionData);
      
      // Charger les relations pour la réponse
      const sanctionComplete = await SanctionPro.findByPk(nouvelleSanction.id, {
        include: [
          {
            model: Employe,
            as: 'employe',
            attributes: ['id', 'nom_famille', 'nom_usage', 'prenoms', 'matricule']
          },
          {
            model: User,
            as: 'demandeur',
            attributes: ['id', 'nom', 'prenom', 'email']
          }
        ]
      });
      
      res.status(201).json({
        success: true,
        message: 'Demande de sanction créée avec succès',
        data: sanctionComplete
      });
    } catch (error) {
      console.error('Erreur lors de la création de la sanction:', error);

      if (error.name === 'SequelizeForeignKeyConstraintError') {
        return res.status(400).json({
          success: false,
          message: 'L\'employé spécifié n\'existe pas'
        });
      }

      if (error.name === 'SequelizeValidationError' && error.errors?.length) {
        const errArray = error.errors.map((e) => ({ msg: e.message, message: e.message, path: e.path }));
        const firstMsg = error.errors[0].message;
        return res.status(400).json({
          success: false,
          message: firstMsg,
          errors: errArray
        });
      }

      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la création de la sanction'
      });
    }
  }
);

// PUT /api/sanctions-pro/:id - Mettre à jour une demande de sanction (seulement si en_attente)
router.put('/:id',
  authenticateToken,
  [
    body('type_sanction').optional().isIn(['avertissement_verbal', 'avertissement_ecrit', 'blame', 'mise_a_pied', 'retrogradation', 'licenciement_faute_grave']).withMessage('Type de sanction invalide'),
    body('motif').optional().trim().isLength({ min: 10, max: 2000 }).withMessage('Le motif doit contenir entre 10 et 2000 caractères'),
    body('date_incident').optional().isISO8601().withMessage('Date d\'incident invalide'),
    body('duree_suspension').optional().isInt({ min: 1, max: 8 }).withMessage('La durée de suspension doit être entre 1 et 8 jours')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Données de validation invalides',
          errors: errors.array()
        });
      }
      
      const sanction = await SanctionPro.findByPk(req.params.id);
      
      if (!sanction) {
        return res.status(404).json({
          success: false,
          message: 'Demande de sanction non trouvée'
        });
      }
      
      // Vérifier que la demande est en attente
      if (sanction.statut !== 'en_attente') {
        return res.status(400).json({
          success: false,
          message: 'Seules les demandes en attente peuvent être modifiées'
        });
      }
      
      // Vérifier que l'utilisateur est le demandeur ou a les permissions
      const canModify = ['Patron', 'Administrateur'].includes(req.user.role) || sanction.demandeur_id === req.user.id;
      if (!canModify) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'avez pas la permission de modifier cette demande'
        });
      }
      
      // Calculer la date de fin de suspension si nécessaire
      if (req.body.type_sanction === 'mise_a_pied' && req.body.duree_suspension && req.body.date_debut_suspension) {
        const dateDebut = new Date(req.body.date_debut_suspension);
        const dateFin = new Date(dateDebut);
        dateFin.setDate(dateFin.getDate() + req.body.duree_suspension);
        req.body.date_fin_suspension = dateFin.toISOString().split('T')[0];
      }
      
      await sanction.update(req.body);
      
      const sanctionMiseAJour = await SanctionPro.findByPk(sanction.id, {
        include: [
          {
            model: Employe,
            as: 'employe',
            attributes: ['id', 'nom_famille', 'nom_usage', 'prenoms', 'matricule']
          },
          {
            model: User,
            as: 'demandeur',
            attributes: ['id', 'nom', 'prenom', 'email']
          }
        ]
      });
      
      res.json({
        success: true,
        message: 'Demande de sanction mise à jour avec succès',
        data: sanctionMiseAJour
      });
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la sanction:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la mise à jour de la sanction'
      });
    }
  }
);

// PUT /api/sanctions-pro/:id/status - Approuver/Rejeter une demande (Superviseur RH uniquement)
router.put('/:id/status',
  authenticateToken,
  requireRole(['Superviseur RH', 'Patron', 'Administrateur']),
  [
    body('statut').isIn(['approuve', 'rejete']).withMessage('Statut invalide'),
    body('commentaire_rh').optional().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Données de validation invalides',
          errors: errors.array()
        });
      }
      
      const { statut, commentaire_rh } = req.body;
      
      const sanction = await SanctionPro.findByPk(req.params.id, {
        include: [
          {
            model: Employe,
            as: 'employe',
            attributes: ['id', 'nom_famille', 'nom_usage', 'prenoms', 'matricule']
          },
          {
            model: User,
            as: 'demandeur',
            attributes: ['id', 'nom', 'prenom', 'email']
          }
        ]
      });
      
      if (!sanction) {
        return res.status(404).json({
          success: false,
          message: 'Demande de sanction non trouvée'
        });
      }
      
      if (sanction.statut !== 'en_attente') {
        return res.status(400).json({
          success: false,
          message: 'Seules les demandes en attente peuvent être traitées'
        });
      }
      
      sanction.statut = statut;
      sanction.commentaire_rh = commentaire_rh || null;
      sanction.validateur_id = req.user.id;
      sanction.date_validation = new Date();
      
      await sanction.save();
      
      const sanctionMiseAJour = await SanctionPro.findByPk(sanction.id, {
        include: [
          {
            model: Employe,
            as: 'employe',
            attributes: ['id', 'nom_famille', 'nom_usage', 'prenoms', 'matricule']
          },
          {
            model: User,
            as: 'demandeur',
            attributes: ['id', 'nom', 'prenom', 'email']
          },
          {
            model: User,
            as: 'validateur',
            attributes: ['id', 'nom', 'prenom', 'email']
          }
        ]
      });
      
      res.json({
        success: true,
        message: `Demande ${statut === 'approuve' ? 'approuvée' : 'rejetée'} avec succès`,
        data: sanctionMiseAJour
      });
    } catch (error) {
      console.error('Erreur lors du changement de statut:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors du changement de statut'
      });
    }
  }
);

// DELETE /api/sanctions-pro/:id - Supprimer une demande (seulement si en_attente)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const sanction = await SanctionPro.findByPk(req.params.id);
    
    if (!sanction) {
      return res.status(404).json({
        success: false,
        message: 'Demande de sanction non trouvée'
      });
    }
    
    // Vérifier que la demande est en attente
    if (sanction.statut !== 'en_attente') {
      return res.status(400).json({
        success: false,
        message: 'Seules les demandes en attente peuvent être supprimées'
      });
    }
    
    // Vérifier que l'utilisateur est le demandeur ou a les permissions
    const canDelete = ['Patron', 'Administrateur'].includes(req.user.role) || sanction.demandeur_id === req.user.id;
    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'avez pas la permission de supprimer cette demande'
      });
    }
    
    await sanction.destroy();
    
    res.json({
      success: true,
      message: 'Demande de sanction supprimée avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression de la sanction:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la suppression de la sanction'
    });
  }
});

module.exports = router;

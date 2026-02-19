const express = require('express');
const path = require('path');
const multer = require('multer');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { authenticateToken, requireRole } = require('../middleware/auth');
const SanctionPro = require('../models/SanctionPro');
const { User, Employe } = require('../models');
const { CloudinaryService } = require('../services/cloudinaryService');

const uploadPieces = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|pdf/i;
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = file.mimetype && (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') && allowed.test(ext.replace('.', ''));
    if (ok) cb(null, true);
    else cb(new Error('Fichier non autorisé (images jpg, png, gif, webp ou PDF)'));
  }
});

// Multer pour les pièces des étapes (convocation, PV, notification)
const uploadEtapePieces = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|pdf/i;
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = file.mimetype && (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') && allowed.test(ext.replace('.', ''));
    if (ok) cb(null, true);
    else cb(new Error('Fichier non autorisé (images jpg, png, gif, webp ou PDF)'));
  }
});

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
        },
        {
          model: User,
          as: 'validationDirection',
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
        },
        {
          model: User,
          as: 'validationDirection',
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

// Transitions du circuit : statuts autorisés
const TRANSITIONS = {
  en_attente: ['en_analyse_rh', 'classement_sans_suite'],
  en_analyse_rh: ['convocation_envoyee', 'classement_sans_suite'],
  convocation_envoyee: ['entretien_realise'],
  entretien_realise: ['sanction_validee'],
  sanction_validee: ['sanction_notifiee'],
  sanction_notifiee: ['dossier_cloture']
};

// PUT /api/sanctions-pro/:id/etape - Avancer dans le circuit (RH / Patron / Admin)
router.put('/:id/etape',
  authenticateToken,
  requireRole(['Superviseur RH', 'Patron', 'Administrateur']),
  uploadEtapePieces.fields([
    { name: 'lettre_convocation', maxCount: 1 },
    { name: 'proces_verbal', maxCount: 1 },
    { name: 'lettre_notification', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const sanction = await SanctionPro.findByPk(req.params.id, {
        include: [
          { model: Employe, as: 'employe', attributes: ['id', 'nom_famille', 'prenoms', 'matricule'] },
          { model: User, as: 'demandeur', attributes: ['id', 'nom', 'prenom'] },
          { model: User, as: 'validateur', attributes: ['id', 'nom', 'prenom'] }
        ]
      });
      if (!sanction) {
        return res.status(404).json({ success: false, message: 'Demande de sanction non trouvée' });
      }

      const { etape, decision, date_convocation, date_entretien, date_decision, date_notification, date_cloture, type_sanction, niveau_gravite, validation_direction_id, commentaire_rh } = req.body || {};
      const allowed = TRANSITIONS[sanction.statut];
      if (!allowed) {
        return res.status(400).json({ success: false, message: 'Transition non autorisée depuis l\'état actuel' });
      }

      const documents = (sanction.documents && typeof sanction.documents === 'object') ? { ...sanction.documents } : {};
      const folder = `sanctions-pro/${sanction.id}`;

      const uploadDoc = async (key, fileKey) => {
        const file = req.files && req.files[fileKey] && req.files[fileKey][0];
        if (!file) return;
        const result = await CloudinaryService.uploadBuffer(file.buffer, folder, {
          mimetype: file.mimetype,
          public_id: `${key}_${Date.now()}`
        });
        if (result.success) {
          documents[key] = { url: result.secure_url, nom: file.originalname || file.name || key };
        }
      };

      let newStatut = null;
      const updateData = {};

      if (etape === 'analyse_rh') {
        if (!allowed.includes('en_analyse_rh') && !allowed.includes('classement_sans_suite')) {
          return res.status(400).json({ success: false, message: 'Transition non autorisée' });
        }
        if (decision === 'classement_sans_suite') {
          newStatut = 'classement_sans_suite';
          updateData.commentaire_rh = commentaire_rh || null;
          updateData.validateur_id = req.user.id;
          updateData.date_validation = new Date();
        } else if (decision === 'ouvrir_enquete' || decision === 'passer_analyse') {
          newStatut = 'en_analyse_rh';
          updateData.validateur_id = req.user.id;
          updateData.date_validation = new Date();
        } else {
          return res.status(400).json({ success: false, message: 'decision attendue: ouvrir_enquete, passer_analyse ou classement_sans_suite' });
        }
      } else if (etape === 'convocation') {
        if (!allowed.includes('convocation_envoyee')) {
          return res.status(400).json({ success: false, message: 'Passer d\'abord par l\'analyse RH' });
        }
        await uploadDoc('lettre_convocation', 'lettre_convocation');
        newStatut = 'convocation_envoyee';
        updateData.date_convocation = date_convocation || new Date().toISOString().split('T')[0];
      } else if (etape === 'entretien') {
        if (!allowed.includes('entretien_realise')) {
          return res.status(400).json({ success: false, message: 'Convocation requise avant l\'entretien' });
        }
        await uploadDoc('proces_verbal', 'proces_verbal');
        newStatut = 'entretien_realise';
        updateData.date_entretien = date_entretien || new Date().toISOString().split('T')[0];
      } else if (etape === 'decision') {
        if (!allowed.includes('sanction_validee')) {
          return res.status(400).json({ success: false, message: 'Entretien requis avant la décision' });
        }
        newStatut = 'sanction_validee';
        updateData.date_decision = date_decision || new Date().toISOString().split('T')[0];
        updateData.niveau_gravite = niveau_gravite || null;
        updateData.validation_direction_id = validation_direction_id ? parseInt(validation_direction_id, 10) : null;
        if (type_sanction) {
          updateData.type_sanction = type_sanction;
        }
        updateData.validateur_id = req.user.id;
        updateData.commentaire_rh = commentaire_rh || null;
      } else if (etape === 'notification') {
        if (!allowed.includes('sanction_notifiee')) {
          return res.status(400).json({ success: false, message: 'Décision requise avant la notification' });
        }
        await uploadDoc('lettre_notification', 'lettre_notification');
        newStatut = 'sanction_notifiee';
        updateData.date_notification = date_notification || new Date().toISOString().split('T')[0];
      } else if (etape === 'cloture') {
        if (!allowed.includes('dossier_cloture')) {
          return res.status(400).json({ success: false, message: 'Notification requise avant clôture' });
        }
        newStatut = 'dossier_cloture';
        updateData.date_cloture = date_cloture || new Date().toISOString().split('T')[0];
      } else {
        return res.status(400).json({ success: false, message: 'etape invalide (analyse_rh, convocation, entretien, decision, notification, cloture)' });
      }

      if (newStatut) updateData.statut = newStatut;
      if (Object.keys(documents).length > 0) updateData.documents = documents;

      await sanction.update(updateData);
      const updated = await SanctionPro.findByPk(sanction.id, {
        include: [
          { model: Employe, as: 'employe', attributes: ['id', 'nom_famille', 'prenoms', 'matricule'] },
          { model: User, as: 'demandeur', attributes: ['id', 'nom', 'prenom'] },
          { model: User, as: 'validateur', attributes: ['id', 'nom', 'prenom'] },
          { model: User, as: 'validationDirection', attributes: ['id', 'nom', 'prenom'] }
        ]
      });

      res.json({
        success: true,
        message: 'Étape enregistrée',
        data: updated
      });
    } catch (error) {
      console.error('Erreur étape sanction:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur serveur'
      });
    }
  }
);

// POST /api/sanctions-pro - Créer une nouvelle demande de sanction (Superviseur uniquement) + 3 pièces justificatives optionnelles
router.post('/',
  authenticateToken,
  requireRole(['Superviseur', 'Patron', 'Administrateur']),
  uploadPieces.fields([
    { name: 'piece_1', maxCount: 1 },
    { name: 'piece_2', maxCount: 1 },
    { name: 'piece_3', maxCount: 1 }
  ]),
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

      const employeId = parseInt(req.body.employe_id, 10);
      const employe = await Employe.findByPk(employeId);
      if (!employe) {
        return res.status(404).json({
          success: false,
          message: 'Employé non trouvé'
        });
      }

      const sanctionData = {
        employe_id: employeId,
        type_sanction: req.body.type_sanction,
        motif: req.body.motif.trim(),
        description: req.body.description ? req.body.description.trim() : null,
        date_incident: req.body.date_incident,
        duree_suspension: req.body.duree_suspension ? parseInt(req.body.duree_suspension, 10) : null,
        date_debut_suspension: req.body.date_debut_suspension || null,
        date_fin_suspension: null,
        montant_amende: req.body.montant_amende != null && req.body.montant_amende !== '' ? parseFloat(req.body.montant_amende) : null,
        demandeur_id: req.user.id,
        statut: 'en_attente'
      };

      if (sanctionData.type_sanction === 'mise_a_pied' && sanctionData.duree_suspension && sanctionData.date_debut_suspension) {
        const dateDebut = new Date(sanctionData.date_debut_suspension);
        const dateFin = new Date(dateDebut);
        dateFin.setDate(dateFin.getDate() + sanctionData.duree_suspension);
        sanctionData.date_fin_suspension = dateFin.toISOString().split('T')[0];
      }

      const nouvelleSanction = await SanctionPro.create(sanctionData);

      // Pièces justificatives : upload Cloudinary (3 max)
      const documents = {};
      const folder = `sanctions-pro/${nouvelleSanction.id}`;
      for (let i = 1; i <= 3; i++) {
        const key = `piece_${i}`;
        const file = req.files && req.files[key] && req.files[key][0];
        if (!file) continue;
        try {
          const result = await CloudinaryService.uploadBuffer(file.buffer, folder, {
            mimetype: file.mimetype,
            public_id: `piece_${i}_${Date.now()}`
          });
          if (result.success) {
            documents[key] = { url: result.secure_url, nom: file.originalname || file.name || `piece_${i}` };
          }
        } catch (err) {
          console.error(`Upload pièce ${i} sanction ${nouvelleSanction.id}:`, err);
        }
      }
      if (Object.keys(documents).length > 0) {
        await nouvelleSanction.update({ documents });
      }

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

// PUT /api/sanctions-pro/:id - Mettre à jour une demande de sanction (seulement si en_attente) + pièces optionnelles
router.put('/:id',
  authenticateToken,
  uploadPieces.fields([
    { name: 'piece_1', maxCount: 1 },
    { name: 'piece_2', maxCount: 1 },
    { name: 'piece_3', maxCount: 1 }
  ]),
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

      if (sanction.statut !== 'en_attente') {
        return res.status(400).json({
          success: false,
          message: 'Seules les demandes en attente peuvent être modifiées'
        });
      }

      const canModify = ['Patron', 'Administrateur'].includes(req.user.role) || sanction.demandeur_id === req.user.id;
      if (!canModify) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'avez pas la permission de modifier cette demande'
        });
      }

      // Pièces justificatives : upload Cloudinary (merge avec existant)
      const existingDocs = (sanction.documents && typeof sanction.documents === 'object') ? { ...sanction.documents } : {};
      const folder = `sanctions-pro/${sanction.id}`;
      for (let i = 1; i <= 3; i++) {
        const key = `piece_${i}`;
        const file = req.files && req.files[key] && req.files[key][0];
        if (!file) continue;
        try {
          const result = await CloudinaryService.uploadBuffer(file.buffer, folder, {
            mimetype: file.mimetype,
            public_id: `piece_${i}_${Date.now()}`
          });
          if (result.success) {
            existingDocs[key] = { url: result.secure_url, nom: file.originalname || file.name || `piece_${i}` };
          }
        } catch (err) {
          console.error(`Upload pièce ${i} sanction ${sanction.id}:`, err);
        }
      }
      const updateData = { ...req.body };
      if (Object.keys(existingDocs).length > 0) {
        updateData.documents = existingDocs;
      }

      if (updateData.type_sanction === 'mise_a_pied' && updateData.duree_suspension && updateData.date_debut_suspension) {
        const dateDebut = new Date(updateData.date_debut_suspension);
        const dateFin = new Date(dateDebut);
        dateFin.setDate(dateFin.getDate() + parseInt(updateData.duree_suspension, 10));
        updateData.date_fin_suspension = dateFin.toISOString().split('T')[0];
      }

      await sanction.update(updateData);
      
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

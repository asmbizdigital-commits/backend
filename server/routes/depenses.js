const express = require('express');
const { body, validationResult, query } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Depense = require('../models/Depense');
const User = require('../models/User');
const Chambre = require('../models/Chambre');
const Caisse = require('../models/Caisse');
const CircuitDepense = require('../models/CircuitDepense');
const pdfService = require('../services/pdfService');
const { CloudinaryService } = require('../services/cloudinaryService');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads - Cloudinary uniquement
const upload = multer({
  storage: multer.memoryStorage(), // Stockage en mémoire pour Cloudinary
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Type de fichier non supporté'));
    }
  }
});

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/depenses - Get all expenses with filtering
router.get('/', [
  query('statut').optional().isIn(['En attente', 'Approuvée', 'Payée', 'Rejetée']),
  query('categorie').optional().isIn(['Maintenance', 'Nettoyage', 'Équipement', 'Services', 'Marketing', 'Administration', 'Autre']),
  query('demandeur_id').optional().isInt(),
  query('approbateur_id').optional().isInt(),
  query('chambre_id').optional().isInt(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('tags').optional().isArray()
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

    const { statut, categorie, demandeur_id, approbateur_id, chambre_id, page = 1, limit = 20, tags } = req.query;
    const offset = (page - 1) * limit;

    // Build where clause
    const whereClause = {};
    if (statut) whereClause.statut = statut;
    if (categorie) whereClause.categorie = categorie;
    if (demandeur_id) whereClause.demandeur_id = demandeur_id;
    if (approbateur_id) whereClause.approbateur_id = approbateur_id;
    if (chambre_id) whereClause.chambre_id = chambre_id;

    // Handle tag filtering
    if (tags && tags.length > 0) {
      whereClause.tags = {
        [require('sequelize').Op.or]: tags.map(tag => ({
          [require('sequelize').Op.like]: `%${tag}%`
        }))
      };
    }

    const { count, rows: depenses } = await Depense.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'demandeur',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: User,
          as: 'approbateur',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: Chambre,
          as: 'chambre',
          attributes: ['id', 'numero', 'type']
        },
        {
          model: Caisse,
          as: 'caisse',
          attributes: ['id', 'nom', 'code_caisse', 'devise']
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['date_depense', 'DESC']]
    });

    res.json({
      depenses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({ 
      error: 'Failed to get expenses',
      message: 'Erreur lors de la récupération des dépenses'
    });
  }
});

// GET /api/depenses/:id - Get specific expense
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const depense = await Depense.findByPk(id, {
      include: [
        {
          model: User,
          as: 'demandeur',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: User,
          as: 'approbateur',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: Chambre,
          as: 'chambre',
          attributes: ['id', 'numero', 'type']
        },
        {
          model: Caisse,
          as: 'caisse',
          attributes: ['id', 'nom', 'code_caisse', 'devise']
        }
      ]
    });

    if (!depense) {
      return res.status(404).json({ 
        error: 'Expense not found',
        message: 'Dépense non trouvée'
      });
    }

    res.json({ depense });

  } catch (error) {
    console.error('Get expense error:', error);
    res.status(500).json({ 
      error: 'Failed to get expense',
      message: 'Erreur lors de la récupération de la dépense'
    });
  }
});

// POST /api/depenses - Create new expense with file upload
router.post('/', [
  upload.array('fichiers', 5), // Max 5 files
  body('titre').isLength({ min: 3, max: 255 }),
  body('description').optional().isLength({ max: 1000 }),
  body('montant').isFloat({ min: 0 }),
  body('devise').optional().isLength({ min: 3, max: 3 }),
  body('categorie').isIn(['Maintenance', 'Nettoyage', 'Équipement', 'Services', 'Marketing', 'Administration', 'Autre']),
  body('fournisseur').optional().isLength({ max: 255 }),
  body('numero_facture').optional().isLength({ max: 100 }),
  // Removed chambre_id validation to allow null values
  body('notes').optional().isLength({ max: 1000 }),
  body('tags').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Validation errors:', errors.array());
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Données de validation invalides',
        errors: errors.array()
      });
    }

    console.log('Creating expense with data:', req.body);

    const depenseData = {
      ...req.body,
      demandeur_id: req.user.id,
      fichiers: []
    };

    // Handle tags - convert string to array if needed
    if (req.body.tags) {
      try {
        const tagsArray = Array.isArray(req.body.tags) ? req.body.tags : JSON.parse(req.body.tags);
        depenseData.tags = JSON.stringify(tagsArray);
      } catch (error) {
        console.log('Error parsing tags, using empty array:', error.message);
        depenseData.tags = JSON.stringify([]);
      }
    } else {
      depenseData.tags = JSON.stringify([]);
    }

    // Handle uploaded files
    if (req.files && req.files.length > 0) {
      const filesArray = req.files.map(file => ({
        filename: file.filename,
        originalname: file.originalname,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype
      }));
      depenseData.fichiers = JSON.stringify(filesArray);
    } else {
      depenseData.fichiers = JSON.stringify([]);
    }

    // Convert montant to number
    if (depenseData.montant) {
      depenseData.montant = parseFloat(depenseData.montant);
    }

    // Convert chambre_id to number if provided, or set to null
    if (depenseData.chambre_id && depenseData.chambre_id !== 'null' && depenseData.chambre_id !== '') {
      depenseData.chambre_id = parseInt(depenseData.chambre_id);
    } else {
      depenseData.chambre_id = null;
    }

    // Convert caisse_id to number if provided, or set to null
    if (depenseData.caisse_id && depenseData.caisse_id !== 'null' && depenseData.caisse_id !== '') {
      depenseData.caisse_id = parseInt(depenseData.caisse_id);
    } else {
      depenseData.caisse_id = null;
    }

    console.log('Final expense data:', depenseData);

    const depense = await Depense.create(depenseData);

    res.status(201).json({
      message: 'Dépense créée avec succès',
      depense
    });

  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({ 
      error: 'Failed to create expense',
      message: 'Erreur lors de la création de la dépense',
      details: error.message
    });
  }
});

// PUT /api/depenses/:id - Update expense
router.put('/:id', [
  upload.array('fichiers', 5),
  body('titre').optional().isLength({ min: 3, max: 255 }),
  body('description').optional().isLength({ max: 1000 }),
  body('montant').optional().isFloat({ min: 0 }),
  body('devise').optional().isLength({ min: 3, max: 3 }),
  body('categorie').optional().isIn(['Maintenance', 'Nettoyage', 'Équipement', 'Services', 'Marketing', 'Administration', 'Autre']),
  body('fournisseur').optional().isLength({ max: 255 }),
  body('numero_facture').optional().isLength({ max: 100 }),
  // Removed chambre_id validation to allow null values
  body('notes').optional().isLength({ max: 1000 }),
  body('tags').optional()
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
    const depense = await Depense.findByPk(id);

    if (!depense) {
      return res.status(404).json({ 
        error: 'Expense not found',
        message: 'Dépense non trouvée'
      });
    }

    // Check permissions (only requester or higher roles can update)
    if (depense.demandeur_id !== req.user.id && !req.user.hasPermission('Superviseur')) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: 'Permissions insuffisantes pour modifier cette dépense'
      });
    }

    // Only allow updates if expense is not approved
    if (depense.statut !== 'En attente') {
      return res.status(400).json({ 
        error: 'Cannot update approved expense',
        message: 'Impossible de modifier une dépense approuvée'
      });
    }

    const updateData = { ...req.body };

    // Handle tags - convert string to array if needed
    if (req.body.tags) {
      try {
        const tagsArray = Array.isArray(req.body.tags) ? req.body.tags : JSON.parse(req.body.tags);
        updateData.tags = JSON.stringify(tagsArray);
      } catch (error) {
        console.log('Error parsing tags, using empty array:', error.message);
        updateData.tags = JSON.stringify([]);
      }
    }

    // Handle new file uploads
    if (req.files && req.files.length > 0) {
      const newFiles = req.files.map(file => ({
        filename: file.filename,
        originalname: file.originalname,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype
      }));
      
      const existingFiles = depense.fichiers ? JSON.parse(depense.fichiers) : [];
      updateData.fichiers = JSON.stringify([...existingFiles, ...newFiles]);
    }

    // Convert montant to number if provided
    if (updateData.montant) {
      updateData.montant = parseFloat(updateData.montant);
    }

    // Convert chambre_id to number if provided, or set to null
    if (updateData.chambre_id && updateData.chambre_id !== 'null' && updateData.chambre_id !== '') {
      updateData.chambre_id = parseInt(updateData.chambre_id);
    } else {
      updateData.chambre_id = null;
    }

    await depense.update(updateData);

    res.json({
      message: 'Dépense mise à jour avec succès',
      depense
    });

  } catch (error) {
    console.error('Update expense error:', error);
    res.status(500).json({ 
      error: 'Failed to update expense',
      message: 'Erreur lors de la mise à jour de la dépense'
    });
  }
});

// POST /api/depenses/:id/approve - Approve expense (Superviseur and Auditeur)
router.post('/:id/approve', [
  requireRole(['Superviseur', 'Auditeur'])
], async (req, res) => {
  try {
    const { id } = req.params;
    const depense = await Depense.findByPk(id);

    if (!depense) {
      return res.status(404).json({ 
        error: 'Expense not found',
        message: 'Dépense non trouvée'
      });
    }

    if (depense.statut !== 'En attente') {
      return res.status(400).json({ 
        error: 'Invalid expense status',
        message: 'La dépense doit être en attente pour être approuvée'
      });
    }

    await depense.approve(req.user.id);
    // Circuit dépenses : étape 4 (décaissement approuvé par auditeur)
    try {
      const circuitRef = await CircuitDepense.getCircuitRefByDepenseId(parseInt(id));
      if (circuitRef) {
        await CircuitDepense.creerEtape4(circuitRef, parseInt(id), req.user.id);
        try {
          const { notifyCircuitStep, getCircuitContextFromRef } = require('../services/circuitDepensesNotificationService');
          const ctx = await getCircuitContextFromRef(circuitRef);
          const acteurNom = req.user?.nom ? `${(req.user.prenom || '').trim()} ${req.user.nom}`.trim() || req.user.email : 'L\'auditeur';
          await notifyCircuitStep({
            title: 'Circuit dépenses – Décaissement approuvé par auditeur',
            message: `${acteurNom} a approuvé la dépense #${id}. Le décaissement est approuvé.`,
            link: '/circuits-depenses',
            demandeur_id: ctx?.demandeur_id || depense.demandeur_id,
            superviseur_id: ctx?.superviseur_id,
            created_by: req.user.id,
            app: req.app
          });
        } catch (notifErr) {
          console.error('Notification circuit étape 4:', notifErr);
        }
      }
    } catch (circuitErr) {
      console.error('Circuit dépenses étape 4:', circuitErr);
    }

    res.json({
      message: 'Dépense approuvée avec succès',
      depense
    });

  } catch (error) {
    console.error('Approve expense error:', error);
    res.status(500).json({ 
      error: 'Failed to approve expense',
      message: 'Erreur lors de l\'approbation de la dépense'
    });
  }
});

// POST /api/depenses/:id/reject - Reject expense (Superviseur and above)
router.post('/:id/reject', [
  requireRole('Superviseur')
], async (req, res) => {
  try {
    const { id } = req.params;
    const depense = await Depense.findByPk(id);

    if (!depense) {
      return res.status(404).json({ 
        error: 'Expense not found',
        message: 'Dépense non trouvée'
      });
    }

    if (depense.statut !== 'En attente') {
      return res.status(400).json({ 
        error: 'Invalid expense status',
        message: 'La dépense doit être en attente pour être rejetée'
      });
    }

    await depense.reject(req.user.id);

    res.json({
      message: 'Dépense rejetée avec succès',
      depense
    });

  } catch (error) {
    console.error('Reject expense error:', error);
    res.status(500).json({ 
      error: 'Failed to reject expense',
      message: 'Erreur lors du rejet de la dépense'
    });
  }
});

// PATCH /api/depenses/:id/programmer-paiement - Programmation (caisse + date) par Superviseur Finances APRÈS paiement, uniquement pour décaissements > 2000$
router.patch('/:id/programmer-paiement', [
  requireRole(['Administrateur', 'Superviseur Finance']),
  body('caisse_id').isInt().withMessage('La caisse est requise'),
  body('date_paiement_prevue').optional({ values: 'null' }).isISO8601().withMessage('Date invalide'),
  body('mode_paiement').optional().isString().trim(),
  body('notes').optional().isString().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { id } = req.params;
    const depense = await Depense.findByPk(id);
    if (!depense) {
      return res.status(404).json({ error: 'Dépense non trouvée' });
    }
    if (depense.statut !== 'Payée') {
      return res.status(400).json({
        error: 'Seule une dépense déjà marquée comme payée peut être programmée (caisse et date prévue)',
        message: 'La programmation se fait après le marquage comme payée, pour les décaissements au-delà de 2000$.'
      });
    }
    const montant = parseFloat(depense.montant) || 0;
    const devise = (depense.devise || 'FC').toUpperCase();
    const excedeSeuil =
      (devise === 'USD' && montant > 2000) ||
      (devise === 'EUR' && montant > 2000) ||
      ((devise === 'FC' || devise === 'CDF') && montant > 2000000);
    if (!excedeSeuil) {
      return res.status(400).json({
        error: 'Programmation réservée aux décaissements au-delà de 2000$, 2000€ ou 2 000 000 FC',
        message: 'La programmation (caisse et date prévue) ne s\'applique qu\'aux décaissements au-delà du seuil.'
      });
    }
    const { caisse_id, date_paiement_prevue, mode_paiement, notes } = req.body;
    await depense.update({
      caisse_id: caisse_id || null,
      date_paiement_prevue: date_paiement_prevue || null,
      notes_paiement: notes != null ? notes : depense.notes_paiement
    });
    // Circuit dépenses : étape 6 (validation paiement par le Patron)
    try {
      const circuitRef = await CircuitDepense.getCircuitRefByDepenseId(parseInt(id));
      if (circuitRef) {
        await CircuitDepense.creerEtape6(circuitRef, parseInt(id), req.user.id);
        try {
          const { notifyCircuitStep, getCircuitContextFromRef } = require('../services/circuitDepensesNotificationService');
          const ctx = await getCircuitContextFromRef(circuitRef);
          const acteurNom = req.user?.nom ? `${(req.user.prenom || '').trim()} ${req.user.nom}`.trim() || req.user.email : 'Le Patron';
          await notifyCircuitStep({
            title: 'Circuit dépenses – Validation paiement par le Patron',
            message: `${acteurNom} a validé le paiement de la dépense #${id} (circuit ${circuitRef}).`,
            link: '/circuits-depenses',
            demandeur_id: ctx?.demandeur_id || depense.demandeur_id,
            superviseur_id: ctx?.superviseur_id,
            created_by: req.user.id,
            app: req.app
          });
        } catch (notifErr) {
          console.error('Notification circuit étape 5:', notifErr);
        }
      }
    } catch (circuitErr) {
      console.error('Circuit dépenses étape 6:', circuitErr);
    }
    res.json({
      message: 'Paiement programmé avec succès',
      depense
    });
  } catch (error) {
    console.error('Programmer paiement error:', error);
    res.status(500).json({
      error: 'Erreur lors de la programmation du paiement',
      message: error.message
    });
  }
});

// POST /api/depenses/:id/pay - Marquer comme payée (actif seulement après programmation; Patron/Admin sans dialogue)
router.post('/:id/pay', [
  requireRole(['Administrateur', 'Patron', 'Superviseur Finance'])
], async (req, res) => {
  try {
    const { id } = req.params;
    const depense = await Depense.findByPk(id);

    if (!depense) {
      return res.status(404).json({
        error: 'Expense not found',
        message: 'Dépense non trouvée'
      });
    }

    if (depense.statut !== 'Approuvée') {
      return res.status(400).json({
        error: 'Invalid expense status',
        message: 'La dépense doit être approuvée pour être marquée comme payée'
      });
    }

    const montant = parseFloat(depense.montant) || 0;
    const devise = (depense.devise || 'FC').toUpperCase();
    const seuilPatronOnly =
      (devise === 'USD' && montant > 2000) ||
      (devise === 'EUR' && montant > 2000) ||
      ((devise === 'FC' || devise === 'CDF') && montant > 2000000);

    // Pour les montants > 2000€, 2000$ ou 2 000 000 FC, seul le Patron peut marquer comme payé
    if (seuilPatronOnly && req.user.role !== 'Patron') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Pour ce montant (supérieur à 2000€, 2000$ ou 2 000 000 FC), seul le Patron peut marquer la dépense comme payée.'
      });
    }
    // Pour les montants <= 2000$, seul le Superviseur Finances ou l'Administrateur peut marquer comme payée (pas le Patron)
    if (!seuilPatronOnly && req.user.role === 'Patron') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Pour les décaissements de moins de 2000$, seul le Superviseur Finances ou l\'Administrateur peut marquer la dépense comme payée.'
      });
    }

    // Flux : d'abord marquer comme payée (sans programmation), ensuite le Superviseur Finances programme (caisse + date) uniquement pour décaissements > 2000$
    const datePaiement = depense.date_paiement_prevue ? new Date(depense.date_paiement_prevue) : new Date();
    const caisseId = depense.caisse_id ?? null;

    const PaiementPartiel = require('../models/PaiementPartiel');
    const montantRestant = parseFloat(depense.montant) - parseFloat(depense.montant_paye || 0);

    await PaiementPartiel.create({
      depense_id: depense.id,
      montant: montantRestant,
      mode_paiement: 'Espèces',
      reference_paiement: '',
      notes: depense.notes_paiement || '',
      utilisateur_id: req.user.id,
      caisse_id: caisseId,
      date_paiement: datePaiement
    });

    await depense.update({
      statut: 'Payée',
      statut_paiement: 'Payé',
      montant_paye: depense.montant,
      date_paiement: datePaiement
    });

    try {
      const circuitRef = await CircuitDepense.getCircuitRefByDepenseId(parseInt(id));
      if (circuitRef) {
        await CircuitDepense.creerEtape5(circuitRef, parseInt(id), req.user.id);
        try {
          const { notifyCircuitStep, getCircuitContextFromRef } = require('../services/circuitDepensesNotificationService');
          const ctx = await getCircuitContextFromRef(circuitRef);
          const acteurNom = req.user?.nom ? `${(req.user.prenom || '').trim()} ${req.user.nom}`.trim() || req.user.email : 'Le Patron';
          await notifyCircuitStep({
            title: 'Circuit dépenses – Paiement effectué',
            message: `${acteurNom} a marqué la dépense #${id} comme payée (circuit ${circuitRef}).`,
            link: '/circuits-depenses',
            demandeur_id: ctx?.demandeur_id || depense.demandeur_id,
            superviseur_id: ctx?.superviseur_id,
            created_by: req.user.id,
            app: req.app
          });
        } catch (notifErr) {
          console.error('Notification circuit étape 5:', notifErr);
        }
      }
    } catch (circuitErr) {
      console.error('Circuit dépenses étape 5:', circuitErr);
    }

    try {
      const Caisse = require('../models/Caisse');
      const caisse = await Caisse.findByPk(depense.caisse_id);
      if (caisse) await caisse.calculerSoldeActuel();
    } catch (err) {
      console.error('Mise à jour solde caisse:', err);
    }

    res.json({
      message: 'Dépense marquée comme payée avec succès',
      depense
    });
  } catch (error) {
    console.error('Pay expense error:', error);
    res.status(500).json({
      error: 'Failed to mark expense as paid',
      message: error.message || 'Erreur lors du marquage de la dépense comme payée'
    });
  }
});

// POST /api/depenses/:id/generer-bon-sortie-caisse - Génère le PDF bon de sortie de caisse et enregistre l'étape 7
router.post('/:id/generer-bon-sortie-caisse', [
  requireRole(['Administrateur', 'Patron', 'Superviseur Finance'])
], async (req, res) => {
  try {
    const { id } = req.params;
    const depense = await Depense.findByPk(id, {
      include: [{ model: User, as: 'demandeur', attributes: ['id', 'nom', 'prenom', 'email'] }]
    });

    if (!depense) {
      return res.status(404).json({
        error: 'Expense not found',
        message: 'Dépense non trouvée'
      });
    }

    if (depense.statut !== 'Payée') {
      return res.status(400).json({
        error: 'Invalid expense status',
        message: 'Seule une dépense payée peut générer un bon de sortie de caisse'
      });
    }

    const demandeur = depense.demandeur ? depense.demandeur.get({ plain: true }) : {};
    const result = await pdfService.generateBonSortieCaisse(depense.get({ plain: true }), demandeur);
    const buffer = result && result.buffer;
    if (!buffer || !Buffer.isBuffer(buffer)) {
      return res.status(500).json({
        error: 'PDF generation failed',
        message: 'La génération du PDF a échoué (buffer invalide)'
      });
    }

    const uploadResult = await CloudinaryService.uploadPdfBuffer(
      buffer,
      'hotel-beatrice/depenses',
      `bon-sortie-${id}`
    );
    if (!uploadResult.success) {
      return res.status(500).json({
        error: 'Upload failed',
        message: 'Impossible d\'enregistrer le PDF (Cloudinary): ' + (uploadResult.error || 'Erreur inconnue')
      });
    }
    const pdfUrl = uploadResult.secure_url || uploadResult.url;

    const circuitRef = await CircuitDepense.getCircuitRefByDepenseId(parseInt(id));
    if (circuitRef) {
      await CircuitDepense.creerEtape7(circuitRef, parseInt(id), req.user.id, pdfUrl);
      try {
        const { notifyCircuitStep, getCircuitContextFromRef } = require('../services/circuitDepensesNotificationService');
        const ctx = await getCircuitContextFromRef(circuitRef);
        const acteurNom = req.user?.nom ? `${(req.user.prenom || '').trim()} ${req.user.nom}`.trim() || req.user.email : 'Un utilisateur';
        await notifyCircuitStep({
          title: 'Circuit dépenses – Bon de sortie de caisse généré',
          message: `${acteurNom} a généré le bon de sortie de caisse pour la dépense #${id} (circuit ${circuitRef}).`,
          link: '/circuits-depenses',
          demandeur_id: ctx?.demandeur_id || depense.demandeur_id,
          superviseur_id: ctx?.superviseur_id,
          created_by: req.user.id,
          app: req.app
        });
      } catch (notifErr) {
        console.error('Notification circuit étape 7:', notifErr);
      }
    }

    const filename = `bon-sortie-caisse-${id}-${Date.now()}.pdf`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.type('application/pdf').send(buffer);
  } catch (error) {
    console.error('Generer bon sortie caisse error:', error);
    res.status(500).json({
      error: 'Failed to generate voucher',
      message: error.message || 'Erreur lors de la génération du bon de sortie de caisse'
    });
  }
});

// POST /api/depenses/payer-complet - Marquer une dépense comme payée avec sélection de caisse
router.post('/payer-complet', requireRole(['Administrateur', 'Patron']), async (req, res) => {
  try {
    const { depense_id, caisse_id, date_paiement, mode_paiement, notes } = req.body;

    if (!depense_id || !caisse_id) {
      return res.status(400).json({ 
        error: 'depense_id et caisse_id sont requis' 
      });
    }

    const depense = await Depense.findByPk(depense_id);
    if (!depense) {
      return res.status(404).json({ error: 'Dépense non trouvée' });
    }

    if (depense.statut !== 'Approuvée') {
      return res.status(400).json({ 
        error: 'La dépense doit être approuvée pour être marquée comme payée' 
      });
    }

    // Pour les montants > 2000€, 2000$ ou 2 000 000 FC, seul le Patron peut marquer comme payé
    const montantPayComplet = parseFloat(depense.montant) || 0;
    const devisePayComplet = (depense.devise || 'FC').toUpperCase();
    const seuilPatronOnlyPayComplet =
      (devisePayComplet === 'USD' && montantPayComplet > 2000) ||
      (devisePayComplet === 'EUR' && montantPayComplet > 2000) ||
      ((devisePayComplet === 'FC' || devisePayComplet === 'CDF') && montantPayComplet > 2000000);
    if (seuilPatronOnlyPayComplet && req.user.role !== 'Patron') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Pour ce montant (supérieur à 2000€, 2000$ ou 2 000 000 FC), seul le Patron peut marquer la dépense comme payée.'
      });
    }

    // Créer le paiement partiel avec tout le montant restant
    const PaiementPartiel = require('../models/PaiementPartiel');
    const montantRestant = parseFloat(depense.montant) - parseFloat(depense.montant_paye || 0);
    
    const paiement = await PaiementPartiel.create({
      depense_id,
      montant: montantRestant,
      mode_paiement: mode_paiement || 'Espèces',
      reference_paiement: '',
      notes: notes || '',
      utilisateur_id: req.user.id,
      caisse_id,
      date_paiement: date_paiement || new Date()
    });

    // Marquer la dépense comme payée
    await depense.update({
      statut: 'Payée',
      statut_paiement: 'Payé',
      montant_paye: depense.montant,
      date_paiement: date_paiement || new Date()
    });
    // Circuit dépenses : étape 5 (paiement effectué)
    try {
      const circuitRef = await CircuitDepense.getCircuitRefByDepenseId(parseInt(depense_id));
      if (circuitRef) {
        await CircuitDepense.creerEtape5(circuitRef, parseInt(depense_id), req.user.id);
        try {
          const { notifyCircuitStep, getCircuitContextFromRef } = require('../services/circuitDepensesNotificationService');
          const ctx = await getCircuitContextFromRef(circuitRef);
          const acteurNom = req.user?.nom ? `${(req.user.prenom || '').trim()} ${req.user.nom}`.trim() || req.user.email : 'Le Patron';
          await notifyCircuitStep({
            title: 'Circuit dépenses – Paiement effectué',
            message: `${acteurNom} a marqué la dépense #${depense_id} comme payée (circuit ${circuitRef}).`,
            link: '/circuits-depenses',
            demandeur_id: ctx?.demandeur_id || depense.demandeur_id,
            superviseur_id: ctx?.superviseur_id,
            created_by: req.user.id,
            app: req.app
          });
        } catch (notifErr) {
          console.error('Notification circuit étape 5:', notifErr);
        }
      }
    } catch (circuitErr) {
      console.error('Circuit dépenses étape 5:', circuitErr);
    }

    // Mettre à jour le solde de la caisse
    try {
      const Caisse = require('../models/Caisse');
      const caisse = await Caisse.findByPk(caisse_id);
      if (caisse) {
        await caisse.calculerSoldeActuel();
      }
    } catch (error) {
      console.error('Erreur lors de la mise à jour du solde de la caisse:', error);
    }

    res.json({
      message: 'Dépense marquée comme payée avec succès',
      depense,
      paiement
    });

  } catch (error) {
    console.error('Erreur lors du paiement complet de la dépense:', error);
    res.status(500).json({ 
      error: 'Erreur lors du paiement de la dépense',
      message: error.message 
    });
  }
});

// DELETE /api/depenses/:id - Delete expense (Administrateur and above)
router.delete('/:id', [
  requireRole('Administrateur')
], async (req, res) => {
  try {
    const { id } = req.params;
    const depense = await Depense.findByPk(id);

    if (!depense) {
      return res.status(404).json({ 
        error: 'Expense not found',
        message: 'Dépense non trouvée'
      });
    }

    // Delete associated files from Cloudinary (if they exist)
    if (depense.fichiers && depense.fichiers.length > 0) {
      console.log('🗑️ Suppression des fichiers associés depuis Cloudinary...');
      // Note: Les fichiers sont maintenant sur Cloudinary, pas de suppression locale nécessaire
    }

    await depense.destroy();

    res.json({
      message: 'Dépense supprimée avec succès'
    });

  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ 
      error: 'Failed to delete expense',
      message: 'Erreur lors de la suppression de la dépense'
    });
  }
});

// GET /api/depenses/stats/overview - Get expense statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const { Op } = require('sequelize');
    
    // Basic counts
    const totalExpenses = await Depense.count();
    const pendingExpenses = await Depense.count({ where: { statut: 'En attente' } });
    const approvedExpenses = await Depense.count({ where: { statut: 'Approuvée' } });
    const paidExpenses = await Depense.count({ where: { statut: 'Payée' } });
    const rejectedExpenses = await Depense.count({ where: { statut: 'Rejetée' } });

    // Get total amounts by status
    const totalAmount = await Depense.sum('montant');
    const pendingAmount = await Depense.sum('montant', { where: { statut: 'En attente' } });
    const approvedAmount = await Depense.sum('montant', { where: { statut: 'Approuvée' } });
    const paidAmount = await Depense.sum('montant', { where: { statut: 'Payée' } });
    const rejectedAmount = await Depense.sum('montant', { where: { statut: 'Rejetée' } });

    // Recent expenses (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentExpenses = await Depense.count({
      where: {
        date_depense: {
          [Op.gte]: thirtyDaysAgo
        }
      }
    });

    const recentAmount = await Depense.sum('montant', {
      where: {
        date_depense: {
          [Op.gte]: thirtyDaysAgo
        }
      }
    });

    // Monthly expenses (current month)
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);
    
    const monthlyExpenses = await Depense.count({
      where: {
        date_depense: {
          [Op.gte]: currentMonth
        }
      }
    });

    const monthlyAmount = await Depense.sum('montant', {
      where: {
        date_depense: {
          [Op.gte]: currentMonth
        }
      }
    });

    // Get expenses by category with detailed stats
    const expensesByCategory = await Depense.findAll({
      attributes: [
        'categorie',
        [Depense.sequelize.fn('COUNT', Depense.sequelize.col('id')), 'count'],
        [Depense.sequelize.fn('SUM', Depense.sequelize.col('montant')), 'total'],
        [Depense.sequelize.fn('AVG', Depense.sequelize.col('montant')), 'average']
      ],
      group: ['categorie']
    });

    // Get expenses by status
    const expensesByStatus = await Depense.findAll({
      attributes: [
        'statut',
        [Depense.sequelize.fn('COUNT', Depense.sequelize.col('id')), 'count'],
        [Depense.sequelize.fn('SUM', Depense.sequelize.col('montant')), 'total']
      ],
      group: ['statut']
    });

    // Average expense amount
    const avgExpenseAmount = totalExpenses > 0 ? (totalAmount / totalExpenses).toFixed(2) : 0;

    // Approval rate calculation
    const approvalRate = totalExpenses > 0 ? (((approvedExpenses + paidExpenses) / totalExpenses) * 100).toFixed(2) : 0;
    const paymentRate = totalExpenses > 0 ? ((paidExpenses / totalExpenses) * 100).toFixed(2) : 0;
    const rejectionRate = totalExpenses > 0 ? ((rejectedExpenses / totalExpenses) * 100).toFixed(2) : 0;

    res.json({
      stats: {
        total: totalExpenses,
        pending: pendingExpenses,
        approved: approvedExpenses,
        paid: paidExpenses,
        rejected: rejectedExpenses,
        totalAmount: totalAmount || 0,
        pendingAmount: pendingAmount || 0,
        approvedAmount: approvedAmount || 0,
        paidAmount: paidAmount || 0,
        rejectedAmount: rejectedAmount || 0,
        recent: recentExpenses,
        recentAmount: recentAmount || 0,
        monthly: monthlyExpenses,
        monthlyAmount: monthlyAmount || 0,
        avgAmount: parseFloat(avgExpenseAmount),
        approvalRate: parseFloat(approvalRate),
        paymentRate: parseFloat(paymentRate),
        rejectionRate: parseFloat(rejectionRate)
      },
      expensesByCategory,
      expensesByStatus
    });

  } catch (error) {
    console.error('Get expense stats error:', error);
    res.status(500).json({ 
      error: 'Failed to get expense statistics',
      message: 'Erreur lors de la récupération des statistiques'
    });
  }
});

// GET /api/depenses/reports/financial - Get comprehensive financial reports
router.get('/reports/financial', async (req, res) => {
  try {
    const { Op } = require('sequelize');
    const Paiement = require('../models/Paiement');
    
    // Get current year data
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59);

    // Get total revenue (sum of all validated payments)
    const totalRevenue = await Paiement.sum('montant', {
      where: {
        statut: 'Validé',
        date_paiement: {
          [Op.between]: [startOfYear, endOfYear]
        }
      }
    });

    // Get total expenses (sum of all approved/paid expenses)
    const totalExpenses = await Depense.sum('montant', {
      where: {
        statut: {
          [Op.in]: ['Approuvée', 'Payée']
        },
        date_depense: {
          [Op.between]: [startOfYear, endOfYear]
        }
      }
    });

    // Calculate net profit
    const netProfit = (totalRevenue || 0) - (totalExpenses || 0);
    const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100) : 0;

    // Get monthly revenue data (last 6 months)
    const monthlyRevenue = [];
    const monthlyExpenses = [];
    
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(currentYear, new Date().getMonth() - i, 1);
      const monthEnd = new Date(currentYear, new Date().getMonth() - i + 1, 0, 23, 59, 59);
      
      const monthRevenue = await Paiement.sum('montant', {
        where: {
          statut: 'Validé',
          date_paiement: {
            [Op.between]: [monthStart, monthEnd]
          }
        }
      });

      const monthExpenses = await Depense.sum('montant', {
        where: {
          statut: {
            [Op.in]: ['Approuvée', 'Payée']
          },
          date_depense: {
            [Op.between]: [monthStart, monthEnd]
          }
        }
      });

      const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
      monthlyRevenue.push({
        month: monthNames[monthStart.getMonth()],
        revenue: monthRevenue || 0
      });

      monthlyExpenses.push({
        month: monthNames[monthStart.getMonth()],
        expenses: monthExpenses || 0
      });
    }

    // Get revenue sources breakdown
    const revenueByType = await Paiement.findAll({
      attributes: [
        'type_paiement',
        [Paiement.sequelize.fn('SUM', Paiement.sequelize.col('montant')), 'total'],
        [Paiement.sequelize.fn('COUNT', Paiement.sequelize.col('id')), 'count']
      ],
      where: {
        statut: 'Validé',
        date_paiement: {
          [Op.between]: [startOfYear, endOfYear]
        }
      },
      group: ['type_paiement']
    });

    // Calculate percentages for revenue sources
    const topRevenueSources = revenueByType.map(source => ({
      source: source.type_paiement || 'Autre',
      revenue: parseFloat(source.dataValues.total || 0),
      percentage: totalRevenue > 0 ? Math.round(((parseFloat(source.dataValues.total || 0) / totalRevenue) * 100)) : 0
    })).sort((a, b) => b.revenue - a.revenue);

    // Get expense breakdown by category
    const expensesByCategory = await Depense.findAll({
      attributes: [
        'categorie',
        [Depense.sequelize.fn('SUM', Depense.sequelize.col('montant')), 'total'],
        [Depense.sequelize.fn('COUNT', Depense.sequelize.col('id')), 'count']
      ],
      where: {
        statut: {
          [Op.in]: ['Approuvée', 'Payée']
        },
        date_depense: {
          [Op.between]: [startOfYear, endOfYear]
        }
      },
      group: ['categorie']
    });

    // Calculate percentages for expense categories
    const expenseBreakdown = expensesByCategory.map(category => ({
      category: category.categorie,
      amount: parseFloat(category.dataValues.total || 0),
      percentage: totalExpenses > 0 ? Math.round(((parseFloat(category.dataValues.total || 0) / totalExpenses) * 100)) : 0
    })).sort((a, b) => b.amount - a.amount);

    // Get cash register balances
    const caisses = await Caisse.findAll({
      where: { statut: 'Active' },
      attributes: ['id', 'nom', 'solde_actuel', 'devise']
    });

    // Calculate total cash balance
    const totalCashBalance = caisses.reduce((total, caisse) => {
      return total + parseFloat(caisse.solde_actuel || 0);
    }, 0);

    res.json({
      success: true,
      data: {
        totalRevenue: totalRevenue || 0,
        totalExpenses: totalExpenses || 0,
        netProfit: netProfit,
        profitMargin: Math.round(profitMargin * 100) / 100,
        monthlyRevenue,
        monthlyExpenses,
        topRevenueSources,
        expenseBreakdown,
        totalCashBalance,
        caisses: caisses.map(caisse => ({
          id: caisse.id,
          nom: caisse.nom,
          solde: parseFloat(caisse.solde_actuel || 0),
          devise: caisse.devise
        }))
      }
    });

  } catch (error) {
    console.error('Get financial reports error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get financial reports',
      message: 'Erreur lors de la récupération des rapports financiers'
    });
  }
});

module.exports = router; 
const express = require('express');
const { body, validationResult, query } = require('express-validator');
const multer = require('multer');
const path = require('path');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const Plainte = require('../models/Plainte');
const TaskPro = require('../models/TaskPro');
const User = require('../models/User');
const Client = require('../models/Client');
const Chambre = require('../models/Chambre');
const Departement = require('../models/Departement');
const SousDepartement = require('../models/SousDepartement');
const { authenticateToken, requireRole } = require('../middleware/auth');
const CloudinaryImageService = require('../services/cloudinaryImageService');
const imageService = new CloudinaryImageService();

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = file.mimetype && (
      file.mimetype.startsWith('image/') || 
      file.mimetype === 'application/pdf' ||
      file.mimetype === 'application/msword' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Type de fichier non supporté'));
    }
  }
});

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/plaintes/check-table - Check if table exists
router.get('/check-table', async (req, res) => {
  try {
    const [results] = await sequelize.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() 
      AND table_name = 'tbl_plaintes'
    `);
    
    const tableExists = results[0].count > 0;
    
    if (!tableExists) {
      return res.status(404).json({
        error: 'Table not found',
        message: 'La table tbl_plaintes n\'existe pas dans la base de données',
        solution: 'Exécutez la migration: mysql -u root -p hotel_beatrice < database/create_tbl_plaintes.sql',
        script: './database/migrate_plaintes.sh'
      });
    }
    
    // Vérifier la structure de la table
    const [columns] = await sequelize.query(`DESCRIBE tbl_plaintes`);
    
    res.json({
      exists: true,
      message: 'La table tbl_plaintes existe',
      columns: columns.length,
      structure: columns.map(col => ({
        field: col.Field,
        type: col.Type,
        null: col.Null,
        key: col.Key
      }))
    });
  } catch (error) {
    console.error('Check table error:', error);
    res.status(500).json({
      error: 'Error checking table',
      message: error.message
    });
  }
});

// Helper function to generate complaint number
const generateNumeroPlainte = async () => {
  const year = new Date().getFullYear();
  const count = await Plainte.count({
    where: {
      date_creation: {
        [Op.gte]: new Date(`${year}-01-01`)
      }
    }
  });
  const numero = `PLAINTE-${year}-${String(count + 1).padStart(4, '0')}`;
  return numero;
};

// GET /api/plaintes - Get all complaints with filters and pagination
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('type_plainte').optional().isIn(['Interne', 'Externe']),
  query('statut').optional().isIn(['Nouvelle', 'En cours', 'En attente', 'Résolue', 'Fermée', 'Rejetée']),
  query('priorite').optional().isIn(['Basse', 'Normale', 'Haute', 'Urgente']),
  query('categorie').optional().isIn(['Service', 'Qualité', 'Sécurité', 'Ressources Humaines', 'Financier', 'Technique', 'Autre'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const {
      page = 1,
      limit = 20,
      type_plainte,
      statut,
      priorite,
      categorie,
      departement_id,
      assignee_id,
      search,
      date_debut,
      date_fin
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const whereClause = {};

    if (type_plainte) {
      whereClause.type_plainte = type_plainte;
    }

    if (statut) {
      whereClause.statut = statut;
    }

    if (priorite) {
      whereClause.priorite = priorite;
    }

    if (categorie) {
      whereClause.categorie = categorie;
    }

    if (departement_id) {
      const deptId = parseInt(departement_id);
      if (!isNaN(deptId)) {
        whereClause.departement_id = deptId;
      }
    }

    if (assignee_id) {
      const assigneeId = parseInt(assignee_id);
      if (!isNaN(assigneeId)) {
        whereClause.assignee_id = assigneeId;
      }
    }

    // Date range filter
    if (date_debut || date_fin) {
      whereClause.date_creation = {};
      if (date_debut) {
        whereClause.date_creation[Op.gte] = new Date(date_debut);
      }
      if (date_fin) {
        whereClause.date_creation[Op.lte] = new Date(date_fin);
      }
    }

    // Search functionality
    if (search && search.trim() !== '') {
      whereClause[Op.or] = [
        { titre: { [Op.like]: `%${search.trim()}%` } },
        { description: { [Op.like]: `%${search.trim()}%` } },
        { numero_plainte: { [Op.like]: `%${search.trim()}%` } },
        { plaignant_nom: { [Op.like]: `%${search.trim()}%` } },
        { plaignant_prenom: { [Op.like]: `%${search.trim()}%` } },
        { plaignant_email: { [Op.like]: `%${search.trim()}%` } }
      ];
    }

    const { count, rows: plaintes } = await Plainte.findAndCountAll({
      where: whereClause,
      attributes: { exclude: ['client_id'] },
      include: [
        {
          model: User,
          as: 'rapporteur',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: User,
          as: 'employe',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: Chambre,
          as: 'chambre',
          attributes: ['id', 'numero', 'type']
        },
        {
          model: Departement,
          as: 'departement',
          attributes: ['id', 'nom', 'responsable_id']
        },
        {
          model: SousDepartement,
          as: 'sous_departement',
          attributes: ['id', 'nom', 'departement_id']
        }
      ],
      limit: limitNum,
      offset: offset,
      order: [['date_creation', 'DESC']]
    });

    res.json({
      plaintes: plaintes.map(p => p.toJSON()),
      totalItems: count,
      totalPages: Math.ceil(count / limitNum),
      currentPage: pageNum,
      limit: limitNum
    });

  } catch (error) {
    console.error('Get complaints error:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    
    if (error.message && (error.message.includes("Unknown column 'client_id'") || (error.message.includes("client_id") && error.message.includes("Unknown column")))) {
      return res.status(500).json({
        error: 'Migration clients requise',
        message: 'Colonne client_id absente. Exécutez : node backend/scripts/run-clients-migration.js',
        details: error.message
      });
    }
    if (error.message && (error.message.includes("doesn't exist") || error.message.includes("Unknown table"))) {
      return res.status(500).json({
        error: 'Table not found',
        message: 'La table tbl_plaintes n\'existe pas. Veuillez exécuter la migration de la base de données.',
        details: 'Exécutez: mysql -u root -p hotel_beatrice < database/create_tbl_plaintes.sql'
      });
    }
    res.status(500).json({
      error: 'Failed to get complaints',
      message: 'Erreur lors de la récupération des plaintes',
      details: error.message
    });
  }
});

// GET /api/plaintes/stats - Get statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = {
      total: await Plainte.count(),
      par_type: {
        interne: await Plainte.count({ where: { type_plainte: 'Interne' } }),
        externe: await Plainte.count({ where: { type_plainte: 'Externe' } })
      },
      par_statut: {
        nouvelle: await Plainte.count({ where: { statut: 'Nouvelle' } }),
        en_cours: await Plainte.count({ where: { statut: 'En cours' } }),
        en_attente: await Plainte.count({ where: { statut: 'En attente' } }),
        resolue: await Plainte.count({ where: { statut: 'Résolue' } }),
        fermee: await Plainte.count({ where: { statut: 'Fermée' } }),
        rejetee: await Plainte.count({ where: { statut: 'Rejetée' } })
      },
      par_priorite: {
        basse: await Plainte.count({ where: { priorite: 'Basse' } }),
        normale: await Plainte.count({ where: { priorite: 'Normale' } }),
        haute: await Plainte.count({ where: { priorite: 'Haute' } }),
        urgente: await Plainte.count({ where: { priorite: 'Urgente' } })
      },
      par_categorie: {}
    };

    const categories = ['Service', 'Qualité', 'Sécurité', 'Ressources Humaines', 'Financier', 'Technique', 'Autre'];
    for (const cat of categories) {
      stats.par_categorie[cat.toLowerCase().replace(' ', '_')] = await Plainte.count({ where: { categorie: cat } });
    }

    res.json({ stats });
  } catch (error) {
    console.error('Get stats error:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    
    // Vérifier si c'est une erreur de table inexistante
    if (error.message && (error.message.includes("doesn't exist") || error.message.includes("Unknown table"))) {
      return res.status(500).json({ 
        error: 'Table not found',
        message: 'La table tbl_plaintes n\'existe pas. Veuillez exécuter la migration de la base de données.',
        details: 'Exécutez: mysql -u root -p hotel_beatrice < database/create_tbl_plaintes.sql'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to get stats',
      message: 'Erreur lors de la récupération des statistiques',
      details: error.message
    });
  }
});

// GET /api/plaintes/:id - Get specific complaint
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const plainte = await Plainte.findByPk(id, {
      attributes: { exclude: ['client_id'] },
      include: [
        {
          model: User,
          as: 'rapporteur',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: User,
          as: 'employe',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: Chambre,
          as: 'chambre',
          attributes: ['id', 'numero', 'type']
        },
        {
          model: Departement,
          as: 'departement',
          attributes: ['id', 'nom', 'responsable_id']
        },
        {
          model: SousDepartement,
          as: 'sous_departement',
          attributes: ['id', 'nom', 'departement_id']
        }
      ]
    });

    if (!plainte) {
      return res.status(404).json({ 
        error: 'Complaint not found',
        message: 'Plainte non trouvée'
      });
    }

    res.json({ plainte: plainte.toJSON() });

  } catch (error) {
    console.error('Get complaint error:', error);
    console.error('Error details:', error.message);
    
    if (error.message && (error.message.includes("doesn't exist") || error.message.includes("Unknown table"))) {
      return res.status(500).json({ 
        error: 'Table not found',
        message: 'La table tbl_plaintes n\'existe pas. Veuillez exécuter la migration de la base de données.',
        details: 'Exécutez: mysql -u root -p hotel_beatrice < database/create_tbl_plaintes.sql'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to get complaint',
      message: 'Erreur lors de la récupération de la plainte',
      details: error.message
    });
  }
});

// POST /api/plaintes - Create new complaint
router.post('/', [
  upload.array('fichiers', 5),
  body('type_plainte').isIn(['Interne', 'Externe']).withMessage('Type de plainte invalide'),
  body('titre').isLength({ min: 3, max: 255 }).withMessage('Titre invalide (3-255 caractères)'),
  body('description').isLength({ min: 10 }).withMessage('Description invalide (minimum 10 caractères)'),
  body('categorie').isIn(['Service', 'Qualité', 'Sécurité', 'Ressources Humaines', 'Financier', 'Technique', 'Autre']),
  body('priorite').isIn(['Basse', 'Normale', 'Haute', 'Urgente']),
  body('employe_id').optional().isInt(),
  body('departement_id').optional().isInt(),
  body('chambre_id').optional().isInt(),
  body('date_incident').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const {
      type_plainte,
      titre,
      description,
      categorie,
      priorite,
      employe_id,
      client_id,
      plaignant_nom,
      plaignant_prenom,
      plaignant_email,
      plaignant_telephone,
      plaignant_type,
      departement_id,
      sous_departement_id,
      chambre_id,
      date_incident,
      date_limite,
      tags,
      notes_internes,
      confidentialite
    } = req.body;

    // Validate type-specific fields
    if (type_plainte === 'Interne' && !employe_id) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'L\'ID de l\'employé est requis pour une plainte interne'
      });
    }

    let plaignantNom = plaignant_nom;
    let plaignantPrenom = plaignant_prenom;
    let plaignantEmail = plaignant_email;
    let plaignantTelephone = plaignant_telephone;
    const clientId = client_id ? parseInt(client_id, 10) : null;
    if (type_plainte === 'Externe' && clientId) {
      const client = await Client.findByPk(clientId);
      if (client) {
        plaignantNom = client.getDisplayName();
        plaignantPrenom = client.prenom || plaignant_prenom;
        plaignantEmail = client.email || plaignant_email;
        plaignantTelephone = client.telephone || client.mobile || plaignant_telephone;
      }
    }
    if (type_plainte === 'Externe' && !clientId && (!plaignantNom || !plaignantEmail)) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Pour une plainte externe : renseignez un client (référentiel) ou le nom et l\'email du plaignant'
      });
    }

    // Generate complaint number
    const numero_plainte = await generateNumeroPlainte();

    // Process uploaded files
    const fichiers_joints = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const fileData = await imageService.processAndSaveImage(
            file,
            null, // Will be set after complaint creation
            req.user.id,
            'upload'
          );
          fichiers_joints.push({
            nom: file.originalname,
            url: fileData.url || fileData.chemin_fichier,
            type: file.mimetype,
            taille: file.size
          });
        } catch (error) {
          console.error('Error processing file:', error);
        }
      }
    }

    // Create complaint
    const plainte = await Plainte.create({
      numero_plainte,
      type_plainte,
      titre,
      description,
      categorie: categorie || 'Autre',
      priorite: priorite || 'Normale',
      statut: 'Nouvelle',
      employe_id: type_plainte === 'Interne' ? parseInt(employe_id) : null,
      client_id: type_plainte === 'Externe' ? clientId : null,
      plaignant_nom: type_plainte === 'Externe' ? plaignantNom : null,
      plaignant_prenom: type_plainte === 'Externe' ? plaignantPrenom : null,
      plaignant_email: type_plainte === 'Externe' ? plaignantEmail : null,
      plaignant_telephone: type_plainte === 'Externe' ? plaignantTelephone : null,
      plaignant_type: type_plainte === 'Externe' ? plaignant_type : null,
      departement_id: departement_id ? parseInt(departement_id) : null,
      sous_departement_id: sous_departement_id ? parseInt(sous_departement_id) : null,
      chambre_id: chambre_id ? parseInt(chambre_id) : null,
      rapporteur_id: req.user.id,
      date_incident: date_incident ? new Date(date_incident) : null,
      date_limite: date_limite ? new Date(date_limite) : null,
      tags: tags ? (Array.isArray(tags) ? tags : JSON.parse(tags)) : null,
      fichiers_joints: fichiers_joints.length > 0 ? fichiers_joints : null,
      notes_internes: notes_internes || null,
      confidentialite: confidentialite || 'Interne'
    });

    // Add initial status to history
    await plainte.addStatusHistory(req.user.id, null, 'Nouvelle', 'Plainte créée');

    res.status(201).json({ 
      message: 'Plainte créée avec succès',
      plainte: plainte.toJSON()
    });

  } catch (error) {
    console.error('Create complaint error:', error);
    res.status(500).json({ 
      error: 'Failed to create complaint',
      message: 'Erreur lors de la création de la plainte',
      details: error.message
    });
  }
});

// Helper to generate task number (for auto-created tasks from plaintes)
const generateNumeroTache = async () => {
  const year = new Date().getFullYear();
  const count = await TaskPro.count({
    where: {
      date_creation: {
        [Op.gte]: new Date(`${year}-01-01`)
      }
    }
  });
  return `TASK-${year}-${String(count + 1).padStart(4, '0')}`;
};

// PUT /api/plaintes/:id - Update complaint
router.put('/:id', [
  upload.array('fichiers', 5),
  body('titre').optional().isLength({ min: 3, max: 255 }),
  body('description').optional().isLength({ min: 10 }),
  body('statut').optional().isIn(['Nouvelle', 'En cours', 'En attente', 'Résolue', 'Fermée', 'Rejetée']),
  body('priorite').optional().isIn(['Basse', 'Normale', 'Haute', 'Urgente']),
  body('assignee_id').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { id } = req.params;
    const plainte = await Plainte.findByPk(id);

    if (!plainte) {
      return res.status(404).json({ 
        error: 'Complaint not found',
        message: 'Plainte non trouvée'
      });
    }

    const oldStatus = plainte.statut;
    const previousAssigneeId = plainte.assignee_id ? parseInt(plainte.assignee_id, 10) : null;
    const updateData = { ...req.body };

    // Normalize assignee_id from form (string to int)
    if (updateData.assignee_id !== undefined && updateData.assignee_id !== '') {
      updateData.assignee_id = parseInt(updateData.assignee_id, 10) || null;
    } else if (updateData.assignee_id === '') {
      updateData.assignee_id = null;
    }

    // Handle status change
    if (updateData.statut && updateData.statut !== oldStatus) {
      updateData.date_assignation = updateData.statut === 'En cours' ? new Date() : plainte.date_assignation;
      updateData.date_resolution = updateData.statut === 'Résolue' ? new Date() : plainte.date_resolution;
      updateData.date_fermeture = (updateData.statut === 'Fermée' || updateData.statut === 'Rejetée') ? new Date() : plainte.date_fermeture;
      
      // Add to history
      await plainte.addStatusHistory(req.user.id, oldStatus, updateData.statut, updateData.commentaire_statut || 'Changement de statut');
    }

    // Handle assignment
    if (updateData.assignee_id && updateData.assignee_id !== previousAssigneeId) {
      updateData.date_assignation = new Date();
    }

    // Update complaint (only pass fields that exist on Plainte to avoid stripping)
    const plainteFields = ['titre', 'description', 'statut', 'priorite', 'assignee_id', 'date_assignation', 'date_resolution', 'date_fermeture', 'employe_id', 'client_id', 'departement_id', 'sous_departement_id', 'chambre_id', 'date_incident', 'date_limite', 'notes_internes', 'confidentialite', 'categorie', 'type_plainte', 'plaignant_nom', 'plaignant_prenom', 'plaignant_email', 'plaignant_telephone', 'plaignant_type'];
    const filteredUpdate = {};
    plainteFields.forEach(f => {
      if (updateData[f] !== undefined) filteredUpdate[f] = updateData[f];
    });
    await plainte.update(filteredUpdate);

    // Calculate duration if resolved
    if (plainte.statut === 'Résolue') {
      await plainte.calculateDuration();
    }

    // When a responsible is assigned (new or changed), create a task "À faire" with checklist "Lecture et prise en mains"
    // Use plainte after update so we rely on the value actually persisted
    await plainte.reload();
    const assigneeAfterUpdate = plainte.assignee_id != null ? parseInt(plainte.assignee_id, 10) : null;
    const shouldCreateTask = assigneeAfterUpdate && assigneeAfterUpdate !== previousAssigneeId;
    if (shouldCreateTask) {
      try {
        const numero_tache = await generateNumeroTache();
        const checklist = [
          { id: Date.now(), text: 'Lecture et prise en mains', completed: false }
        ];
        await TaskPro.create({
          numero_tache,
          titre: `Plainte ${plainte.numero_plainte} - Prise en charge`,
          description: `Tâche créée automatiquement pour la plainte ${plainte.numero_plainte} : ${plainte.titre || ''}`.trim(),
          type_tache: 'Tâche',
          statut: 'À faire',
          colonne_kanban: 'À faire',
          priorite: plainte.priorite || 'Normale',
          createur_id: req.user.id,
          assignee_id: assigneeAfterUpdate,
          departement_id: plainte.departement_id || null,
          sous_departement_id: plainte.sous_departement_id || null,
          checklist,
          nombre_checklist_items: 1,
          checklist_completed: 0,
          progression: 0,
          visibilite: 'Public',
          confidentialite: 'Normale'
        });
      } catch (taskErr) {
        console.error('Error creating task from plainte assignment:', taskErr);
        // Do not fail the plainte update; task creation is best-effort
      }
    }

    res.json({ 
      message: 'Plainte mise à jour avec succès',
      plainte: plainte.toJSON()
    });

  } catch (error) {
    console.error('Update complaint error:', error);
    res.status(500).json({ 
      error: 'Failed to update complaint',
      message: 'Erreur lors de la mise à jour de la plainte'
    });
  }
});

// DELETE /api/plaintes/:id - Delete complaint
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const plainte = await Plainte.findByPk(id);

    if (!plainte) {
      return res.status(404).json({ 
        error: 'Complaint not found',
        message: 'Plainte non trouvée'
      });
    }

    await plainte.destroy();

    res.json({ 
      message: 'Plainte supprimée avec succès'
    });

  } catch (error) {
    console.error('Delete complaint error:', error);
    res.status(500).json({ 
      error: 'Failed to delete complaint',
      message: 'Erreur lors de la suppression de la plainte'
    });
  }
});

// PATCH /api/plaintes/:id/assign - Assign complaint to user
router.patch('/:id/assign', [
  body('assignee_id').isInt().withMessage('ID assigné invalide')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { id } = req.params;
    const { assignee_id } = req.body;

    const plainte = await Plainte.findByPk(id);
    if (!plainte) {
      return res.status(404).json({ 
        error: 'Complaint not found',
        message: 'Plainte non trouvée'
      });
    }

    await plainte.update({
      assignee_id: parseInt(assignee_id),
      date_assignation: new Date(),
      statut: plainte.statut === 'Nouvelle' ? 'En cours' : plainte.statut
    });

    await plainte.addStatusHistory(req.user.id, plainte.statut, 'En cours', 'Plainte assignée');

    res.json({ 
      message: 'Plainte assignée avec succès',
      plainte: plainte.toJSON()
    });

  } catch (error) {
    console.error('Assign complaint error:', error);
    res.status(500).json({ 
      error: 'Failed to assign complaint',
      message: 'Erreur lors de l\'assignation de la plainte'
    });
  }
});

// PATCH /api/plaintes/:id/resolve - Resolve complaint
router.patch('/:id/resolve', [
  body('resolution').isLength({ min: 10 }).withMessage('La description de la résolution est requise (minimum 10 caractères)'),
  body('actions_correctives').optional().isLength({ min: 5 }),
  body('satisfaction_client').optional().isIn(['Très satisfait', 'Satisfait', 'Neutre', 'Insatisfait', 'Très insatisfait'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { id } = req.params;
    const { resolution, actions_correctives, satisfaction_client, commentaire_satisfaction, montant_remboursement, type_compensation } = req.body;

    const plainte = await Plainte.findByPk(id);
    if (!plainte) {
      return res.status(404).json({ 
        error: 'Complaint not found',
        message: 'Plainte non trouvée'
      });
    }

    const oldStatus = plainte.statut;

    await plainte.update({
      statut: 'Résolue',
      resolution,
      actions_correctives: actions_correctives || null,
      satisfaction_client: satisfaction_client || null,
      commentaire_satisfaction: commentaire_satisfaction || null,
      montant_remboursement: montant_remboursement ? parseFloat(montant_remboursement) : null,
      type_compensation: type_compensation || null,
      date_resolution: new Date()
    });

    await plainte.calculateDuration();
    await plainte.addStatusHistory(req.user.id, oldStatus, 'Résolue', 'Plainte résolue');

    res.json({ 
      message: 'Plainte résolue avec succès',
      plainte: plainte.toJSON()
    });

  } catch (error) {
    console.error('Resolve complaint error:', error);
    res.status(500).json({ 
      error: 'Failed to resolve complaint',
      message: 'Erreur lors de la résolution de la plainte'
    });
  }
});

module.exports = router;


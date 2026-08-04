const express = require('express');
const { body, validationResult, query } = require('express-validator');
const multer = require('multer');
const path = require('path');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const TaskPro = require('../models/TaskPro');
const User = require('../models/User');
const Departement = require('../models/Departement');
const SousDepartement = require('../models/SousDepartement');
const CommentaireTask = require('../models/CommentaireTask');
const { authenticateToken, requireRole } = require('../middleware/auth');
const CloudinaryImageService = require('../services/cloudinaryImageService');
const AssignationBL = require('../models/AssignationBL');
const AssignationBLControleur = require('../models/AssignationBLControleur');
const { logDossierActivity, ACTION_TYPES } = require('../utils/dossierActivityLog');
const imageService = new CloudinaryImageService();

const router = express.Router();

/** Parse YYYY-MM-DD en borne locale (évite le décalage UTC de new Date('YYYY-MM-DD')). */
function parseLocalDateBoundary(isoDateStr, endOfDay = false) {
  const m = String(isoDateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  if (endOfDay) return new Date(y, mo, d, 23, 59, 59, 999);
  return new Date(y, mo, d, 0, 0, 0, 0);
}

/** Filtre strict sur date_creation uniquement (date de création de la tâche). */
function applyDateCreationRange(whereClause, date_from, date_to) {
  if (!date_from && !date_to) return;
  const range = {};
  const fromD = date_from ? parseLocalDateBoundary(date_from, false) : null;
  const toD = date_to ? parseLocalDateBoundary(date_to, true) : null;
  if (fromD && !Number.isNaN(fromD.getTime())) {
    range[Op.gte] = fromD;
  }
  if (toD && !Number.isNaN(toD.getTime())) {
    range[Op.lte] = toD;
  }
  if (Object.keys(range).length > 0) {
    whereClause.date_creation = range;
  }
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|xls|xlsx|txt|zip|rar/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = file.mimetype && (
      file.mimetype.startsWith('image/') || 
      file.mimetype === 'application/pdf' ||
      file.mimetype === 'application/msword' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'text/plain' ||
      file.mimetype === 'application/zip' ||
      file.mimetype === 'application/x-rar-compressed'
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

// Helper function to generate task number
const generateNumeroTache = async () => {
  const year = new Date().getFullYear();
  const count = await TaskPro.count({
    where: {
      date_creation: {
        [Op.gte]: new Date(`${year}-01-01`)
      }
    }
  });
  const numero = `TASK-${year}-${String(count + 1).padStart(4, '0')}`;
  return numero;
};

// GET /api/task-pro - Get all tasks with filters and pagination
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('statut').optional().isIn(['À faire', 'En cours', 'En révision', 'Terminé', 'Bloqué', 'Annulé']),
  query('colonne_kanban').optional().isString(),
  query('priorite').optional().isIn(['Basse', 'Normale', 'Haute', 'Urgente']),
  query('assignee_id').optional().isInt(),
  query('projet_id').optional().isInt()
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
      limit = 50,
      statut,
      colonne_kanban,
      priorite,
      assignee_id,
      createur_id,
      projet_id,
      departement_id,
      search,
      archive = false,
      view = 'kanban' // kanban, list, calendar
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const whereClause = {
      supprime: false,
      archive: archive === 'true'
    };

    if (statut) {
      whereClause.statut = statut;
    }

    if (colonne_kanban) {
      whereClause.colonne_kanban = colonne_kanban;
    }

    if (priorite) {
      whereClause.priorite = priorite;
    }

    if (assignee_id) {
      const assigneeId = parseInt(assignee_id);
      if (!isNaN(assigneeId)) {
        whereClause.assignee_id = assigneeId;
      }
    }

    if (createur_id) {
      const createurId = parseInt(createur_id);
      if (!isNaN(createurId)) {
        whereClause.createur_id = createurId;
      }
    }

    if (projet_id) {
      const projetId = parseInt(projet_id);
      if (!isNaN(projetId)) {
        whereClause.projet_id = projetId;
      }
    }

    if (departement_id) {
      const deptId = parseInt(departement_id);
      if (!isNaN(deptId)) {
        whereClause.departement_id = deptId;
      }
    }

    // Search functionality
    if (search && search.trim() !== '') {
      whereClause[Op.or] = [
        { titre: { [Op.like]: `%${search.trim()}%` } },
        { description: { [Op.like]: `%${search.trim()}%` } },
        { numero_tache: { [Op.like]: `%${search.trim()}%` } }
      ];
    }

    const { date_from, date_to } = req.query;
    applyDateCreationRange(whereClause, date_from, date_to);

    // Order by position for Kanban view
    const order = view === 'kanban' 
      ? [['colonne_kanban', 'ASC'], ['position', 'ASC'], ['date_creation', 'DESC']]
      : [['date_creation', 'DESC']];

    const { count, rows: tasks } = await TaskPro.findAndCountAll({
      where: whereClause,
      attributes: { exclude: ['client_id'] },
      include: [
        {
          model: User,
          as: 'createur',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: Departement,
          as: 'departement',
          attributes: ['id', 'nom']
        },
        {
          model: SousDepartement,
          as: 'sous_departement',
          attributes: ['id', 'nom']
        }
      ],
      limit: limitNum,
      offset: offset,
      order: order
    });

    res.json({
      tasks: tasks.map(t => t.toJSON()),
      totalItems: count,
      totalPages: Math.ceil(count / limitNum),
      currentPage: pageNum,
      limit: limitNum
    });

  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ 
      error: 'Failed to get tasks',
      message: 'Erreur lors de la récupération des tâches',
      details: error.message
    });
  }
});

// GET /api/task-pro/kanban - Get tasks organized by Kanban columns
router.get('/kanban', async (req, res) => {
  try {
    const {
      projet_id,
      assignee_id,
      archive = false,
      priorite,
      departement_id,
      type_tache,
      search,
      date_from,
      date_to
    } = req.query;

    const whereClause = {
      supprime: false,
      archive: archive === 'true' || archive === true
    };

    if (projet_id) {
      whereClause.projet_id = parseInt(projet_id);
    }

    if (assignee_id) {
      whereClause.assignee_id = parseInt(assignee_id);
    }

    if (priorite) {
      whereClause.priorite = priorite;
    }

    if (departement_id) {
      const deptId = parseInt(departement_id);
      if (!Number.isNaN(deptId)) whereClause.departement_id = deptId;
    }

    if (type_tache) {
      whereClause.type_tache = type_tache;
    }

    if (search && String(search).trim() !== '') {
      const term = String(search).trim();
      whereClause[Op.or] = [
        { titre: { [Op.like]: `%${term}%` } },
        { description: { [Op.like]: `%${term}%` } },
        { numero_tache: { [Op.like]: `%${term}%` } }
      ];
    }

    applyDateCreationRange(whereClause, date_from, date_to);

    const tasks = await TaskPro.findAll({
      where: whereClause,
      attributes: { exclude: ['client_id'] },
      include: [
        {
          model: User,
          as: 'createur',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'nom', 'prenom', 'email']
        }
      ],
      order: [['colonne_kanban', 'ASC'], ['position', 'ASC']]
    });

    // Organize tasks by columns
    const columns = {
      'À faire': [],
      'En cours': [],
      'En révision': [],
      'Terminé': [],
      'Bloqué': [],
      'Annulé': []
    };

    tasks.forEach(task => {
      const column = task.colonne_kanban || task.statut;
      if (columns[column]) {
        columns[column].push(task.toJSON());
      }
    });

    res.json({ columns });

  } catch (error) {
    console.error('Get kanban error:', error);
    res.status(500).json({ 
      error: 'Failed to get kanban',
      message: 'Erreur lors de la récupération du tableau Kanban',
      details: error.message
    });
  }
});

// GET /api/task-pro/stats - Get statistics
router.get('/stats', async (req, res) => {
  try {
    // Use colonne_kanban for stats to match the Kanban view (more reliable than statut)
    const stats = {
      total: await TaskPro.count({ where: { supprime: false, archive: false } }),
      par_statut: {
        a_faire: await TaskPro.count({ where: { colonne_kanban: 'À faire', supprime: false, archive: false } }),
        en_cours: await TaskPro.count({ where: { colonne_kanban: 'En cours', supprime: false, archive: false } }),
        en_revision: await TaskPro.count({ where: { colonne_kanban: 'En révision', supprime: false, archive: false } }),
        termine: await TaskPro.count({ where: { colonne_kanban: 'Terminé', supprime: false, archive: false } }),
        bloque: await TaskPro.count({ where: { colonne_kanban: 'Bloqué', supprime: false, archive: false } }),
        annule: await TaskPro.count({ where: { colonne_kanban: 'Annulé', supprime: false, archive: false } })
      },
      par_priorite: {
        basse: await TaskPro.count({ where: { priorite: 'Basse', supprime: false, archive: false } }),
        normale: await TaskPro.count({ where: { priorite: 'Normale', supprime: false, archive: false } }),
        haute: await TaskPro.count({ where: { priorite: 'Haute', supprime: false, archive: false } }),
        urgente: await TaskPro.count({ where: { priorite: 'Urgente', supprime: false, archive: false } })
      },
      en_retard: await TaskPro.count({
        where: {
          date_echeance: { [Op.lt]: new Date() },
          statut: { [Op.ne]: 'Terminé' },
          supprime: false,
          archive: false
        }
      }),
      archivees: await TaskPro.count({ where: { archive: true, supprime: false } })
    };

    res.json({ stats });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ 
      error: 'Failed to get stats',
      message: 'Erreur lors de la récupération des statistiques',
      details: error.message
    });
  }
});

// GET /api/task-pro/:id - Get specific task
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const task = await TaskPro.findByPk(id, {
      attributes: { exclude: ['client_id'] },
      include: [
        {
          model: User,
          as: 'createur',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: Departement,
          as: 'departement',
          attributes: ['id', 'nom']
        },
        {
          model: SousDepartement,
          as: 'sous_departement',
          attributes: ['id', 'nom']
        }
      ]
    });

    if (!task) {
      return res.status(404).json({ 
        error: 'Task not found',
        message: 'Tâche non trouvée'
      });
    }

    // Increment view count
    task.vues = (task.vues || 0) + 1;
    task.derniere_vue = new Date();
    await task.save();

    // Load comments from dedicated table
    const taskData = task.toJSON();
    const commentaires = await CommentaireTask.findAll({
      where: {
        task_id: task.id,
        supprime: false
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'nom', 'prenom', 'email']
        }
      ],
      order: [['created_at', 'ASC']],
      raw: false // Ensure we get Sequelize instances, not raw data
    });

    taskData.commentaires = commentaires.map(c => {
      // Get created_at directly from Sequelize instance before toJSON()
      // With underscored: true, we need to access it directly
      const createdAt = c.get('created_at') || c.created_at || c.getDataValue('created_at');
      const commentData = c.toJSON();
      
      // Ensure we have the date - try multiple ways
      const finalCreatedAt = createdAt || commentData.created_at || commentData.createdAt || commentData.timestamp;
      
      return {
        id: commentData.id,
        user_id: commentData.user_id,
        comment: commentData.commentaire,
        timestamp: finalCreatedAt ? (finalCreatedAt instanceof Date ? finalCreatedAt.toISOString() : new Date(finalCreatedAt).toISOString()) : null,
        created_at: finalCreatedAt ? (finalCreatedAt instanceof Date ? finalCreatedAt.toISOString() : new Date(finalCreatedAt).toISOString()) : null,
        edite: commentData.edite || false,
        date_edition: commentData.date_edition || null,
        nombre_likes: commentData.nombre_likes || 0,
        is_liked: commentData.likes && Array.isArray(commentData.likes) && commentData.likes.includes(req.user.id),
        user: commentData.user,
        fichiers_joints: commentData.fichiers_joints || [],
        commentaire_parent_id: commentData.commentaire_parent_id || null
      };
    });

    res.json({ task: taskData });

  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ 
      error: 'Failed to get task',
      message: 'Erreur lors de la récupération de la tâche',
      details: error.message
    });
  }
});

// POST /api/task-pro - Create new task
router.post('/', [
  upload.array('fichiers', 10),
  body('titre').isLength({ min: 3, max: 255 }).withMessage('Titre invalide (3-255 caractères)'),
  body('description').optional().isLength({ min: 0 }),
  body('type_tache').optional().isIn(['Tâche', 'Bug', 'Amélioration', 'Fonctionnalité', 'Documentation', 'Maintenance', 'Autre']),
  body('priorite').optional().isIn(['Basse', 'Normale', 'Haute', 'Urgente']),
  body('statut').optional().isIn(['À faire', 'En cours', 'En révision', 'Terminé', 'Bloqué', 'Annulé'])
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
      titre,
      description,
      type_tache,
      statut,
      priorite,
      colonne_kanban,
      position,
      assignee_id,
      client_id,
      assignees,
      projet_id,
      projet_nom,
      liste_id,
      liste_nom,
      departement_id,
      sous_departement_id,
      date_debut,
      date_echeance,
      estimation_heures,
      labels,
      couleur,
      checklist,
      visibilite,
      confidentialite
    } = req.body;

    // Generate task number
    const numero_tache = await generateNumeroTache();

    // Process uploaded files
    const fichiers_joints = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const fileData = await imageService.processAndSaveImage(
            file,
            null,
            req.user.id,
            'upload'
          );
          fichiers_joints.push({
            nom: file.originalname,
            url: fileData.url || fileData.chemin_fichier,
            type: file.mimetype,
            taille: file.size,
            uploaded_at: new Date().toISOString()
          });
        } catch (error) {
          console.error('Error processing file:', error);
        }
      }
    }

    // Create task
    const task = await TaskPro.create({
      numero_tache,
      titre,
      description: description || null,
      type_tache: type_tache || 'Tâche',
      statut: statut || 'À faire',
      colonne_kanban: colonne_kanban || statut || 'À faire',
      position: position ? parseInt(position) : 0,
      priorite: priorite || 'Normale',
      createur_id: req.user.id,
      assignee_id: assignee_id ? parseInt(assignee_id) : null,
      client_id: client_id ? parseInt(client_id, 10) : null,
      assignees: assignees ? (Array.isArray(assignees) ? assignees : JSON.parse(assignees)) : null,
      projet_id: projet_id ? parseInt(projet_id) : null,
      projet_nom: projet_nom || null,
      liste_id: liste_id ? parseInt(liste_id) : null,
      liste_nom: liste_nom || null,
      departement_id: departement_id ? parseInt(departement_id) : null,
      sous_departement_id: sous_departement_id ? parseInt(sous_departement_id) : null,
      date_debut: date_debut ? new Date(date_debut) : null,
      date_echeance: date_echeance ? new Date(date_echeance) : null,
      estimation_heures: estimation_heures ? parseFloat(estimation_heures) : null,
      labels: labels ? (Array.isArray(labels) ? labels : JSON.parse(labels)) : null,
      couleur: couleur || null,
      checklist: checklist ? (Array.isArray(checklist) ? checklist : JSON.parse(checklist)) : null,
      fichiers_joints: fichiers_joints.length > 0 ? fichiers_joints : null,
      visibilite: visibilite || 'Public',
      confidentialite: confidentialite || 'Normale',
      nombre_attachments: fichiers_joints.length
    });

    // Update checklist counts
    if (task.checklist && task.checklist.length > 0) {
      await task.updateChecklist();
    }

    // Add to history
    await task.addToHistory(req.user.id, 'created', { titre: task.titre });

    res.status(201).json({ 
      message: 'Tâche créée avec succès',
      task: task.toJSON()
    });

  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ 
      error: 'Failed to create task',
      message: 'Erreur lors de la création de la tâche',
      details: error.message
    });
  }
});

// PUT /api/task-pro/:id - Update task
router.put('/:id', [
  body('titre').optional().isLength({ min: 3, max: 255 }),
  body('statut').optional().isIn(['À faire', 'En cours', 'En révision', 'Terminé', 'Bloqué', 'Annulé'])
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
    const task = await TaskPro.findByPk(id, { attributes: { exclude: ['client_id'] } });

    if (!task) {
      return res.status(404).json({ 
        error: 'Task not found',
        message: 'Tâche non trouvée'
      });
    }

    const oldStatus = task.statut;
    const oldColumn = task.colonne_kanban;
    const updateData = { ...req.body };

    // Handle status change
    if (updateData.statut && updateData.statut !== oldStatus) {
      updateData.colonne_kanban = updateData.statut;
      updateData.date_debut_reelle = updateData.statut === 'En cours' && !task.date_debut_reelle ? new Date() : task.date_debut_reelle;
      updateData.date_fin_reelle = updateData.statut === 'Terminé' ? new Date() : task.date_fin_reelle;
      updateData.date_fermeture = (updateData.statut === 'Terminé' || updateData.statut === 'Annulé') ? new Date() : task.date_fermeture;
    }

    // Handle column change (Kanban drag & drop)
    if (updateData.colonne_kanban && updateData.colonne_kanban !== oldColumn) {
      updateData.statut = updateData.colonne_kanban;
    }

    // Handle checklist update
    if (updateData.checklist) {
      try {
        const checklist = Array.isArray(updateData.checklist) 
          ? updateData.checklist 
          : (typeof updateData.checklist === 'string' ? JSON.parse(updateData.checklist) : updateData.checklist);
        updateData.checklist = checklist;
      } catch (error) {
        console.error('Error parsing checklist:', error);
        delete updateData.checklist; // Remove invalid checklist
      }
    }

    // Handle labels update
    if (updateData.labels) {
      try {
        const labels = Array.isArray(updateData.labels) 
          ? updateData.labels 
          : (typeof updateData.labels === 'string' ? JSON.parse(updateData.labels) : updateData.labels);
        updateData.labels = labels;
      } catch (error) {
        console.error('Error parsing labels:', error);
        delete updateData.labels; // Remove invalid labels
      }
    }

    // Handle assignees update
    if (updateData.assignees) {
      try {
        const assignees = Array.isArray(updateData.assignees) 
          ? updateData.assignees 
          : (typeof updateData.assignees === 'string' ? JSON.parse(updateData.assignees) : updateData.assignees);
        updateData.assignees = assignees;
      } catch (error) {
        console.error('Error parsing assignees:', error);
        delete updateData.assignees; // Remove invalid assignees
      }
    }

    // Clean up empty strings and convert to null
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === '') {
        updateData[key] = null;
      }
    });

    // Update task
    await task.update(updateData);

    // Reload task to get updated data
    await task.reload();

    // Add to history after update
    if (updateData.statut && updateData.statut !== oldStatus) {
      try {
        await task.addToHistory(req.user.id, 'status_changed', {
          old_status: oldStatus,
          new_status: updateData.statut
        });
      } catch (error) {
        console.error('Error adding to history:', error);
        // Don't fail the update if history fails
      }
    }

    if (updateData.colonne_kanban && updateData.colonne_kanban !== oldColumn) {
      try {
        await task.addToHistory(req.user.id, 'moved', {
          old_column: oldColumn,
          new_column: updateData.colonne_kanban
        });
      } catch (error) {
        console.error('Error adding to history:', error);
        // Don't fail the update if history fails
      }
    }

    // Update checklist counts if checklist changed
    if (updateData.checklist) {
      try {
        await task.updateChecklist();
      } catch (error) {
        console.error('Error updating checklist:', error);
        // Don't fail the update if checklist update fails
      }

      try {
        const checklist = Array.isArray(task.checklist)
          ? task.checklist
          : typeof task.checklist === 'string'
            ? JSON.parse(task.checklist || '[]')
            : task.checklist || [];
        const completed = checklist.filter((i) => i && i.completed).length;
        const total = checklist.length;

        const assignBl = await AssignationBL.findOne({
          where: { taskProId: task.id },
          order: [['id', 'DESC']]
        });
        const assignCtrl = assignBl
          ? null
          : await AssignationBLControleur.findOne({
              where: { taskProId: task.id },
              order: [['id', 'DESC']]
            });
        const link = assignBl || assignCtrl;
        if (link?.connaissementId) {
          await logDossierActivity(req, {
            connaissementId: link.connaissementId,
            actionType: assignBl
              ? ACTION_TYPES.CHECKLIST_SAISISSEUR
              : ACTION_TYPES.CHECKLIST_CONTROLEUR,
            taskProId: task.id,
            assignationId: link.id,
            metadata: {
              checklist_completed: completed,
              checklist_total: total,
              progression: task.progression
            }
          });
        }
      } catch (logErr) {
        console.error('dossier activity log (task-pro checklist):', logErr.message);
      }
    }

    // Calculate delay
    try {
      await task.calculateDelay();
    } catch (error) {
      console.error('Error calculating delay:', error);
      // Don't fail the update if delay calculation fails
    }

    // Reload task to get all updated data
    await task.reload();

    res.json({ 
      message: 'Tâche mise à jour avec succès',
      task: task.toJSON()
    });

  } catch (error) {
    console.error('Update task error:', error);
    console.error('Error stack:', error.stack);
    console.error('Update data:', updateData);
    
    // Check for validation errors
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Erreur de validation lors de la mise à jour de la tâche',
        details: error.errors.map(e => e.message).join(', ')
      });
    }

    // Check for database errors
    if (error.name === 'SequelizeDatabaseError') {
      return res.status(500).json({ 
        error: 'Database error',
        message: 'Erreur de base de données lors de la mise à jour de la tâche',
        details: error.message
      });
    }

    res.status(500).json({ 
      error: 'Failed to update task',
      message: 'Erreur lors de la mise à jour de la tâche',
      details: error.message
    });
  }
});

// PATCH /api/task-pro/:id/move - Move task to different column (Kanban)
router.patch('/:id/move', [
  body('colonne_kanban').isIn(['À faire', 'En cours', 'En révision', 'Terminé', 'Bloqué', 'Annulé']).withMessage('Colonne invalide'),
  body('position').optional().isInt({ min: 0 })
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
    const { colonne_kanban, position } = req.body;

    const task = await TaskPro.findByPk(id, { attributes: { exclude: ['client_id'] } });
    if (!task) {
      return res.status(404).json({ 
        error: 'Task not found',
        message: 'Tâche non trouvée'
      });
    }

    const oldColumn = task.colonne_kanban;
    const newPosition = position !== undefined ? parseInt(position) : task.position;

    await task.update({
      colonne_kanban,
      statut: colonne_kanban,
      position: newPosition
    });

    await task.addToHistory(req.user.id, 'moved', {
      old_column: oldColumn,
      new_column: colonne_kanban,
      position: newPosition
    });

    res.json({ 
      message: 'Tâche déplacée avec succès',
      task: task.toJSON()
    });

  } catch (error) {
    console.error('Move task error:', error);
    res.status(500).json({ 
      error: 'Failed to move task',
      message: 'Erreur lors du déplacement de la tâche',
      details: error.message
    });
  }
});

// PATCH /api/task-pro/:id/assign - Assign task to user
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

    const task = await TaskPro.findByPk(id, { attributes: { exclude: ['client_id'] } });
    if (!task) {
      return res.status(404).json({ 
        error: 'Task not found',
        message: 'Tâche non trouvée'
      });
    }

    await task.update({
      assignee_id: parseInt(assignee_id)
    });

    await task.addToHistory(req.user.id, 'assigned', {
      assignee_id: parseInt(assignee_id)
    });

    res.json({ 
      message: 'Tâche assignée avec succès',
      task: task.toJSON()
    });

  } catch (error) {
    console.error('Assign task error:', error);
    res.status(500).json({ 
      error: 'Failed to assign task',
      message: 'Erreur lors de l\'assignation de la tâche',
      details: error.message
    });
  }
});

// POST /api/task-pro/:id/comment - Add comment to task (deprecated, use /api/commentaires-tasks instead)
router.post('/:id/comment', [
  body('comment').isLength({ min: 1 }).withMessage('Le commentaire ne peut pas être vide')
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
    const { comment, attachments = [] } = req.body;

    const task = await TaskPro.findByPk(id, { attributes: { exclude: ['client_id'] } });
    if (!task) {
      return res.status(404).json({ 
        error: 'Task not found',
        message: 'Tâche non trouvée'
      });
    }

    // Create comment in dedicated table
    const nouveauCommentaire = await CommentaireTask.create({
      task_id: parseInt(id),
      user_id: req.user.id,
      commentaire: comment.trim(),
      fichiers_joints: attachments.length > 0 ? attachments : null
    });

    // Load with user info
    const commentaireWithUser = await CommentaireTask.findByPk(nouveauCommentaire.id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'nom', 'prenom', 'email']
        }
      ]
    });

    await task.addToHistory(req.user.id, 'commented', { 
      comment_id: nouveauCommentaire.id,
      comment_length: comment.length 
    });

    res.json({ 
      message: 'Commentaire ajouté avec succès',
      commentaire: commentaireWithUser.toJSON()
    });

  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ 
      error: 'Failed to add comment',
      message: 'Erreur lors de l\'ajout du commentaire',
      details: error.message
    });
  }
});

// DELETE /api/task-pro/:id - Delete task (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const task = await TaskPro.findByPk(id, { attributes: { exclude: ['client_id'] } });

    if (!task) {
      return res.status(404).json({ 
        error: 'Task not found',
        message: 'Tâche non trouvée'
      });
    }

    await task.update({
      supprime: true,
      date_suppression: new Date()
    });

    await task.addToHistory(req.user.id, 'deleted', {});

    res.json({ 
      message: 'Tâche supprimée avec succès'
    });

  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ 
      error: 'Failed to delete task',
      message: 'Erreur lors de la suppression de la tâche',
      details: error.message
    });
  }
});

// PATCH /api/task-pro/:id/archive - Archive/Unarchive task
router.patch('/:id/archive', async (req, res) => {
  try {
    const { id } = req.params;
    const { archive } = req.body;

    const task = await TaskPro.findByPk(id, { attributes: { exclude: ['client_id'] } });
    if (!task) {
      return res.status(404).json({ 
        error: 'Task not found',
        message: 'Tâche non trouvée'
      });
    }

    await task.update({
      archive: archive === true || archive === 'true',
      date_archivage: archive === true || archive === 'true' ? new Date() : null
    });

    await task.addToHistory(req.user.id, archive ? 'archived' : 'unarchived', {});

    res.json({ 
      message: archive ? 'Tâche archivée avec succès' : 'Tâche désarchivée avec succès',
      task: task.toJSON()
    });

  } catch (error) {
    console.error('Archive task error:', error);
    res.status(500).json({ 
      error: 'Failed to archive task',
      message: 'Erreur lors de l\'archivage de la tâche',
      details: error.message
    });
  }
});

module.exports = router;


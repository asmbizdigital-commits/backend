const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Tache = require('../models/Tache');
const User = require('../models/User');
const Chambre = require('../models/Chambre');
const Problematique = require('../models/Problematique');
const Departement = require('../models/Departement');
const { authenticateToken, requireRole } = require('../middleware/auth');
const pushNotificationService = require('../services/pushNotificationService');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/taches - Get all tasks with filtering
router.get('/', async (req, res, next) => {
  try {
    const { statut, priorite, type, assigne_id, createur_id, chambre_id, problematique_id, page = 1, limit = 20 } = req.query;
    
    // Validate and sanitize parameters
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (pageNum - 1) * limitNum;

    // Build where clause
    const whereClause = {};
    
    // Validate statut
    const validStatuts = ['À faire', 'En cours', 'En attente', 'Terminée', 'Annulée'];
    if (statut && statut.trim() !== '' && validStatuts.includes(statut.trim())) {
      whereClause.statut = statut.trim();
    }
    
    // Validate priorite
    const validPriorites = ['Basse', 'Normale', 'Haute', 'Urgente'];
    if (priorite && priorite.trim() !== '' && validPriorites.includes(priorite.trim())) {
      whereClause.priorite = priorite.trim();
    }
    
    // Validate type
    const validTypes = ['Nettoyage', 'Maintenance', 'Réception', 'Administrative', 'Autre'];
    if (type && type.trim() !== '' && validTypes.includes(type.trim())) {
      whereClause.type = type.trim();
    }
    
    // Validate IDs
    if (assigne_id && assigne_id.trim() !== '') {
      const assigneId = parseInt(assigne_id);
      if (!isNaN(assigneId)) {
        whereClause.assigne_id = assigneId;
      }
    }
    
    if (createur_id && createur_id.trim() !== '') {
      const createurId = parseInt(createur_id);
      if (!isNaN(createurId)) {
        whereClause.createur_id = createurId;
      }
    }
    
    if (chambre_id && chambre_id.trim() !== '') {
      const chambreId = parseInt(chambre_id);
      if (!isNaN(chambreId)) {
        whereClause.chambre_id = chambreId;
      }
    }
    
    if (problematique_id && problematique_id.trim() !== '') {
      const problematiqueId = parseInt(problematique_id);
      if (!isNaN(problematiqueId)) {
        whereClause.problematique_id = problematiqueId;
      }
    }

    if (req.query.client_id && req.query.client_id.trim() !== '') {
      const clientId = parseInt(req.query.client_id);
      if (!isNaN(clientId)) whereClause.client_id = clientId;
    }

    const { count, rows: taches } = await Tache.findAndCountAll({
      where: whereClause,
      attributes: { exclude: ['client_id'] },
      include: [
        {
          model: User,
          as: 'assigne',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: User,
          as: 'createur',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: Chambre,
          as: 'chambre',
          attributes: ['id', 'numero', 'type']
        },
        {
          model: Problematique,
          as: 'problematique',
          attributes: ['id', 'titre', 'type', 'statut'],
          include: [
            {
              model: Departement,
              as: 'departement',
              attributes: ['id', 'nom', 'responsable_id']
            }
          ]
        }
      ],
      limit: limitNum,
      offset: offset,
      order: [['date_creation', 'DESC']]
    });

    res.json({
      taches,
      totalItems: count,
      totalPages: Math.ceil(count / limitNum),
      currentPage: pageNum,
      limit: limitNum
    });

  } catch (error) {
    console.error('Get tasks error:', error);
    next(error); // Pass error to global error handler
  }
});

// GET /api/taches/:id - Get specific task
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tache = await Tache.findByPk(id, {
      attributes: { exclude: ['client_id'] },
      include: [
        {
          model: User,
          as: 'assigne',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: User,
          as: 'createur',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: Chambre,
          as: 'chambre',
          attributes: ['id', 'numero', 'type']
        }
      ]
    });

    if (!tache) {
      return res.status(404).json({ 
        error: 'Task not found',
        message: 'Tâche non trouvée'
      });
    }

    res.json({ tache });

  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ 
      error: 'Failed to get task',
      message: 'Erreur lors de la récupération de la tâche'
    });
  }
});

// POST /api/taches - Create new task
router.post('/', [
  body('titre').isLength({ min: 3, max: 255 }),
  body('description').optional().isLength({ max: 1000 }),
  body('type').isIn(['Nettoyage', 'Maintenance', 'Réception', 'Administrative', 'Autre']),
  body('priorite').isIn(['Basse', 'Normale', 'Haute', 'Urgente']),
  body('assigne_id').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) return true;
    return !isNaN(parseInt(value));
  }),
  body('chambre_id').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) return true;
    return !isNaN(parseInt(value));
  }),
  body('problematique_id').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) return true;
    return !isNaN(parseInt(value));
  }),
  body('client_id').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) return true;
    return !isNaN(parseInt(value));
  }),
  body('date_limite').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) return true;
    return !isNaN(Date.parse(value));
  }),
  body('duree_estimee').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) return true;
    return !isNaN(parseInt(value)) && parseInt(value) >= 0;
  }),
  body('notes').optional().isLength({ max: 1000 }),
  body('tags').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) return true;
    return typeof value === 'string';
  })
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

    const tacheData = {
      ...req.body,
      createur_id: req.user.id
    };

    // Clean up empty values
    if (tacheData.assigne_id === '' || tacheData.assigne_id === null) {
      delete tacheData.assigne_id;
    } else if (tacheData.assigne_id) {
      tacheData.assigne_id = parseInt(tacheData.assigne_id);
    }

    if (tacheData.chambre_id === '' || tacheData.chambre_id === null) {
      delete tacheData.chambre_id;
    } else if (tacheData.chambre_id) {
      tacheData.chambre_id = parseInt(tacheData.chambre_id);
    }

    if (tacheData.problematique_id === '' || tacheData.problematique_id === null) {
      delete tacheData.problematique_id;
    } else if (tacheData.problematique_id) {
      tacheData.problematique_id = parseInt(tacheData.problematique_id);
    }

    if (tacheData.client_id === '' || tacheData.client_id === null) {
      delete tacheData.client_id;
    } else if (tacheData.client_id) {
      tacheData.client_id = parseInt(tacheData.client_id, 10);
    }

    if (tacheData.date_limite === '' || tacheData.date_limite === null) {
      delete tacheData.date_limite;
    }

    if (tacheData.tags === '' || tacheData.tags === null) {
      delete tacheData.tags;
    }

    if (tacheData.notes === '' || tacheData.notes === null) {
      delete tacheData.notes;
    }

    if (tacheData.duree_estimee === '' || tacheData.duree_estimee === null) {
      delete tacheData.duree_estimee;
    } else if (tacheData.duree_estimee) {
      tacheData.duree_estimee = parseInt(tacheData.duree_estimee);
    }

    const tache = await Tache.create(tacheData);

    // Envoyer notification push si assigné
    if (tache.assigne_id) {
      try {
        await pushNotificationService.notifyTaskAssignment(tache.assigne_id, tache);
        console.log(`✅ Notification push envoyée pour la tâche #${tache.id}`);
      } catch (notifError) {
        console.error('❌ Erreur notification push tâche:', notifError);
        // Ne pas bloquer la création de la tâche si la notification échoue
      }
    }

    res.status(201).json({
      message: 'Tâche créée avec succès',
      tache
    });

  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ 
      error: 'Failed to create task',
      message: 'Erreur lors de la création de la tâche'
    });
  }
});

// PUT /api/taches/:id - Update task
router.put('/:id', [
  body('titre').optional().isLength({ min: 3, max: 255 }),
  body('description').optional().isLength({ max: 1000 }),
  body('type').optional().isIn(['Nettoyage', 'Maintenance', 'Réception', 'Administrative', 'Autre']),
  body('priorite').optional().isIn(['Basse', 'Normale', 'Haute', 'Urgente']),
  body('statut').optional().isIn(['À faire', 'En cours', 'En attente', 'Terminée', 'Annulée']),
  body('assigne_id').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) return true;
    return !isNaN(parseInt(value));
  }),
  body('chambre_id').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) return true;
    return !isNaN(parseInt(value));
  }),
  body('problematique_id').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) return true;
    return !isNaN(parseInt(value));
  }),
  body('client_id').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) return true;
    return !isNaN(parseInt(value));
  }),
  body('date_limite').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) return true;
    return !isNaN(Date.parse(value));
  }),
  body('duree_estimee').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) return true;
    return !isNaN(parseInt(value)) && parseInt(value) >= 0;
  }),
  body('notes').optional().isLength({ max: 1000 }),
  body('tags').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) return true;
    return typeof value === 'string';
  })
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
    const tache = await Tache.findByPk(id, { attributes: { exclude: ['client_id'] } });

    if (!tache) {
      return res.status(404).json({ 
        error: 'Task not found',
        message: 'Tâche non trouvée'
      });
    }

    // Check permissions (only assignee, creator, department manager, or higher roles can update)
    let canUpdate = false;
    
    // Check if user is assignee or creator
    if (tache.assigne_id === req.user.id || tache.createur_id === req.user.id) {
      canUpdate = true;
    }
    
    // Check if user has Superviseur permission
    if (req.user.hasPermission('Superviseur')) {
      canUpdate = true;
    }
    
    // Check if user is Jimmy (special permissions)
    if (req.user.nom === 'Jimmy') {
      canUpdate = true;
    }
    
    // Check if user is department manager (if task is linked to a problematique with a department)
    if (tache.problematique_id) {
      const problematique = await Problematique.findByPk(tache.problematique_id, {
        include: [
          {
            model: Departement,
            as: 'departement',
            attributes: ['id', 'nom', 'responsable_id']
          }
        ]
      });
      
      if (problematique && problematique.departement && problematique.departement.responsable_id === req.user.id) {
        canUpdate = true;
      }
    }
    
    if (!canUpdate) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: 'Permissions insuffisantes pour modifier cette tâche'
      });
    }

    const updateData = { ...req.body };

    // Clean up empty values
    if (updateData.assigne_id === '' || updateData.assigne_id === null) {
      delete updateData.assigne_id;
    } else if (updateData.assigne_id) {
      updateData.assigne_id = parseInt(updateData.assigne_id);
    }

    if (updateData.chambre_id === '' || updateData.chambre_id === null) {
      delete updateData.chambre_id;
    } else if (updateData.chambre_id) {
      updateData.chambre_id = parseInt(updateData.chambre_id);
    }

    if (updateData.problematique_id === '' || updateData.problematique_id === null) {
      delete updateData.problematique_id;
    } else if (updateData.problematique_id) {
      updateData.problematique_id = parseInt(updateData.problematique_id);
    }

    if (updateData.date_limite === '' || updateData.date_limite === null) {
      delete updateData.date_limite;
    }

    if (updateData.tags === '' || updateData.tags === null) {
      delete updateData.tags;
    }

    if (updateData.notes === '' || updateData.notes === null) {
      delete updateData.notes;
    }

    if (updateData.duree_estimee === '' || updateData.duree_estimee === null) {
      delete updateData.duree_estimee;
    } else if (updateData.duree_estimee) {
      updateData.duree_estimee = parseInt(updateData.duree_estimee);
    }

    // Vérifier si l'assignation a changé
    const assignationChanged = updateData.assigne_id && updateData.assigne_id !== tache.assigne_id;
    const previousAssignee = tache.assigne_id;

    await tache.update(updateData);

    // Envoyer notification si l'assignation a changé
    if (assignationChanged && updateData.assigne_id) {
      try {
        await pushNotificationService.notifyTaskAssignment(updateData.assigne_id, tache);
        console.log(`✅ Notification push envoyée pour la réassignation de la tâche #${tache.id}`);
      } catch (notifError) {
        console.error('❌ Erreur notification push réassignation:', notifError);
      }
    }

    // Envoyer notification de changement de statut si applicable
    if (updateData.statut && updateData.statut !== tache.statut) {
      try {
        const targetUserId = updateData.assigne_id || previousAssignee;
        if (targetUserId) {
          await pushNotificationService.notifyStatusUpdate(targetUserId, tache, updateData.statut, 'task');
          console.log(`✅ Notification push statut envoyée pour la tâche #${tache.id}`);
        }
      } catch (notifError) {
        console.error('❌ Erreur notification push statut:', notifError);
      }
    }

    res.json({
      message: 'Tâche mise à jour avec succès',
      tache
    });

  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ 
      error: 'Failed to update task',
      message: 'Erreur lors de la mise à jour de la tâche'
    });
  }
});

// POST /api/taches/:id/start - Start task
router.post('/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    const tache = await Tache.findByPk(id, { attributes: { exclude: ['client_id'] } });

    if (!tache) {
      return res.status(404).json({ 
        error: 'Task not found',
        message: 'Tâche non trouvée'
      });
    }

    // Check if user can start the task
    let canStart = false;
    
    // Check if user is assignee or creator
    if (tache.assigne_id === req.user.id || tache.createur_id === req.user.id) {
      canStart = true;
    }
    
    // Check if user has Superviseur permission
    if (req.user.hasPermission('Superviseur')) {
      canStart = true;
    }
    
    // Check if user is Jimmy (special permissions)
    if (req.user.nom === 'Jimmy') {
      canStart = true;
    }
    
    // Check if user is department manager (if task is linked to a problematique with a department)
    if (tache.problematique_id) {
      const problematique = await Problematique.findByPk(tache.problematique_id, {
        include: [
          {
            model: Departement,
            as: 'departement',
            attributes: ['id', 'nom', 'responsable_id']
          }
        ]
      });
      
      if (problematique && problematique.departement && problematique.departement.responsable_id === req.user.id) {
        canStart = true;
      }
    }
    
    if (!canStart) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: 'Permissions insuffisantes pour démarrer cette tâche'
      });
    }

    if (tache.statut !== 'À faire') {
      return res.status(400).json({ 
        error: 'Invalid task status',
        message: 'La tâche doit être à l\'état "À faire" pour être démarrée'
      });
    }

    await tache.startTask();

    res.json({
      message: 'Tâche démarrée avec succès',
      tache
    });

  } catch (error) {
    console.error('Start task error:', error);
    res.status(500).json({ 
      error: 'Failed to start task',
      message: 'Erreur lors du démarrage de la tâche'
    });
  }
});

// POST /api/taches/:id/complete - Complete task
router.post('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const tache = await Tache.findByPk(id, { attributes: { exclude: ['client_id'] } });

    if (!tache) {
      return res.status(404).json({ 
        error: 'Task not found',
        message: 'Tâche non trouvée'
      });
    }

    // Check if user can complete the task
    let canComplete = false;
    
    // Check if user is assignee or creator
    if (tache.assigne_id === req.user.id || tache.createur_id === req.user.id) {
      canComplete = true;
    }
    
    // Check if user has Superviseur permission
    if (req.user.hasPermission('Superviseur')) {
      canComplete = true;
    }
    
    // Check if user is Jimmy (special permissions)
    if (req.user.nom === 'Jimmy') {
      canComplete = true;
    }
    
    // Check if user is department manager (if task is linked to a problematique with a department)
    if (tache.problematique_id) {
      const problematique = await Problematique.findByPk(tache.problematique_id, {
        include: [
          {
            model: Departement,
            as: 'departement',
            attributes: ['id', 'nom', 'responsable_id']
          }
        ]
      });
      
      if (problematique && problematique.departement && problematique.departement.responsable_id === req.user.id) {
        canComplete = true;
      }
    }
    
    if (!canComplete) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: 'Permissions insuffisantes pour terminer cette tâche'
      });
    }

    if (tache.statut !== 'En cours') {
      return res.status(400).json({ 
        error: 'Invalid task status',
        message: 'La tâche doit être à l\'état "En cours" pour être terminée'
      });
    }

    await tache.completeTask();

    res.json({
      message: 'Tâche terminée avec succès',
      tache
    });

  } catch (error) {
    console.error('Complete task error:', error);
    res.status(500).json({ 
      error: 'Failed to complete task',
      message: 'Erreur lors de la finalisation de la tâche'
    });
  }
});

// DELETE /api/taches/:id - Delete task (Administrateur and above, or Jimmy)
router.delete('/:id', async (req, res) => {
  // Check if user has permission to delete tasks
  if (!req.user.hasPermission('Administrateur') && req.user.nom !== 'Jimmy') {
    return res.status(403).json({ 
      error: 'Insufficient permissions',
      message: 'Permissions insuffisantes pour supprimer cette tâche'
    });
  }
  try {
    const { id } = req.params;
    const tache = await Tache.findByPk(id, { attributes: { exclude: ['client_id'] } });

    if (!tache) {
      return res.status(404).json({ 
        error: 'Task not found',
        message: 'Tâche non trouvée'
      });
    }

    await tache.destroy();

    res.json({
      message: 'Tâche supprimée avec succès'
    });

  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ 
      error: 'Failed to delete task',
      message: 'Erreur lors de la suppression de la tâche'
    });
  }
});

// GET /api/taches/stats/overview - Get task statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const { Op } = require('sequelize');
    
    // Basic counts
    const totalTasks = await Tache.count();
    const pendingTasks = await Tache.count({ where: { statut: 'À faire' } });
    const inProgressTasks = await Tache.count({ where: { statut: 'En cours' } });
    const completedTasks = await Tache.count({ where: { statut: 'Terminée' } });
    const urgentTasks = await Tache.count({ where: { priorite: 'Urgente' } });
    const highPriorityTasks = await Tache.count({ where: { priorite: 'Haute' } });
    const normalPriorityTasks = await Tache.count({ where: { priorite: 'Normale' } });
    const lowPriorityTasks = await Tache.count({ where: { priorite: 'Basse' } });

    // Overdue tasks
    const overdueTasks = await Tache.count({
      where: {
        date_limite: {
          [Op.lt]: new Date()
        },
        statut: {
          [Op.ne]: 'Terminée'
        }
      }
    });

    // Tasks due today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const tasksDueToday = await Tache.count({
      where: {
        date_limite: {
          [Op.gte]: today,
          [Op.lt]: tomorrow
        },
        statut: {
          [Op.ne]: 'Terminée'
        }
      }
    });

    // Recent tasks (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentTasks = await Tache.count({
      where: {
        date_creation: {
          [Op.gte]: sevenDaysAgo
        }
      }
    });

    // Tasks by type with detailed stats
    const tasksByType = await Tache.findAll({
      attributes: [
        'type',
        [Tache.sequelize.fn('COUNT', Tache.sequelize.col('id')), 'count'],
        [Tache.sequelize.fn('COUNT', Tache.sequelize.literal("CASE WHEN statut = 'Terminée' THEN 1 END")), 'completed'],
        [Tache.sequelize.fn('COUNT', Tache.sequelize.literal("CASE WHEN priorite = 'Urgente' THEN 1 END")), 'urgent']
      ],
      group: ['type']
    });

    // Tasks by priority
    const tasksByPriority = await Tache.findAll({
      attributes: [
        'priorite',
        [Tache.sequelize.fn('COUNT', Tache.sequelize.col('id')), 'count']
      ],
      group: ['priorite']
    });

    // Tasks by status
    const tasksByStatus = await Tache.findAll({
      attributes: [
        'statut',
        [Tache.sequelize.fn('COUNT', Tache.sequelize.col('id')), 'count']
      ],
      group: ['statut']
    });

    // Average completion time (for completed tasks)
    const avgCompletionTime = await Tache.findAll({
      attributes: [
        [Tache.sequelize.fn('AVG', 
          Tache.sequelize.literal('TIMESTAMPDIFF(HOUR, date_creation, date_fin)')
        ), 'avgHours']
      ],
      where: {
        statut: 'Terminée',
        date_fin: {
          [Op.ne]: null
        }
      }
    });

    // Completion rate calculation
    const completionRate = totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(2) : 0;
    const urgentRate = totalTasks > 0 ? ((urgentTasks / totalTasks) * 100).toFixed(2) : 0;
    const overdueRate = totalTasks > 0 ? ((overdueTasks / totalTasks) * 100).toFixed(2) : 0;

    res.json({
      stats: {
        total: totalTasks,
        pending: pendingTasks,
        inProgress: inProgressTasks,
        completed: completedTasks,
        urgent: urgentTasks,
        highPriority: highPriorityTasks,
        normalPriority: normalPriorityTasks,
        lowPriority: lowPriorityTasks,
        overdue: overdueTasks,
        dueToday: tasksDueToday,
        recent: recentTasks,
        completionRate: parseFloat(completionRate),
        urgentRate: parseFloat(urgentRate),
        overdueRate: parseFloat(overdueRate),
        avgCompletionTime: avgCompletionTime[0]?.dataValues?.avgHours || 0
      },
      tasksByType,
      tasksByPriority,
      tasksByStatus
    });

  } catch (error) {
    console.error('Get task stats error:', error);
    res.status(500).json({ 
      error: 'Failed to get task statistics',
      message: 'Erreur lors de la récupération des statistiques'
    });
  }
});

module.exports = router; 
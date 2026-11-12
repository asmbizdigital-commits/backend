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
const Connaissement = require('../models/Connaissement');
const { logDossierActivity, ACTION_TYPES } = require('../utils/dossierActivityLog');
const { isResponsableZoneRole } = require('../utils/userRoles');
const {
  applyManagerBureauTaskScope,
  assertManagerBureauCanAccessTask
} = require('../utils/managerBureauTaskAccess');
const imageService = new CloudinaryImageService();

const router = express.Router();

const CONN_DOSSIER_ATTRS = [
  'id',
  'blNumber',
  'numeroDossier',
  'declarationNumber',
  'numeroFeri',
  'isDeclared',
  'isValidated',
  'isControlledByController'
];

/** Lie tâche → dossier B/L (traitement et/ou contrôle). */
async function loadDossierLieForTask(taskProId) {
  const [saisiLink, ctrlLink] = await Promise.all([
    AssignationBL.findOne({
      where: { taskProId },
      include: [
        {
          model: Connaissement,
          as: 'connaissement',
          attributes: CONN_DOSSIER_ATTRS,
          required: false
        }
      ],
      order: [['id', 'DESC']]
    }),
    AssignationBLControleur.findOne({
      where: { taskProId },
      include: [
        {
          model: Connaissement,
          as: 'connaissement',
          attributes: CONN_DOSSIER_ATTRS,
          required: false
        }
      ],
      order: [['id', 'DESC']]
    })
  ]);

  const fromCtrl = ctrlLink?.connaissement || null;
  const fromSaisi = saisiLink?.connaissement || null;
  const doc = fromCtrl || fromSaisi;
  if (!doc) return null;

  const plain = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
  const hasControle = Boolean(ctrlLink);
  const hasTraitement = Boolean(saisiLink);

  return {
    id: plain.id,
    bl_number: plain.blNumber ?? plain.bl_number ?? null,
    numero_dossier: plain.numeroDossier ?? plain.numero_dossier ?? null,
    declaration_number: plain.declarationNumber ?? plain.declaration_number ?? null,
    numero_feri: plain.numeroFeri ?? plain.numero_feri ?? null,
    is_declared: Boolean(plain.isDeclared ?? plain.is_declared),
    is_validated: Boolean(plain.isValidated ?? plain.is_validated),
    source: hasControle && hasTraitement ? 'both' : hasControle ? 'controle' : 'traitement',
    assignation_traitement_id: saisiLink?.id ?? null,
    assignation_controle_id: ctrlLink?.id ?? null
  };
}

/** IDs des tâches créées via assignation contrôle par ce Responsable Zone. */
async function getResponsableZoneControleTaskIds(userId) {
  const uid = parseInt(String(userId), 10);
  if (!Number.isFinite(uid)) return [];
  const rows = await AssignationBLControleur.findAll({
    where: { assigneParId: uid },
    attributes: ['taskProId']
  });
  return [...new Set(rows.map((r) => r.taskProId).filter(Boolean).map(Number))];
}

/**
 * Restreint le where Sequelize aux tâches contrôle assignées par le RZ courant.
 * @returns {{ empty: boolean }}
 */
async function applyResponsableZoneControleTaskScope(whereClause, req) {
  if (!isResponsableZoneRole(req.user?.role)) return { empty: false };
  const ids = await getResponsableZoneControleTaskIds(req.user.id);
  if (!ids.length) {
    whereClause.id = { [Op.in]: [-1] };
    return { empty: true };
  }
  if (whereClause.id && whereClause.id[Op.in]) {
    const allowed = new Set(ids);
    const filtered = whereClause.id[Op.in]
      .map((id) => Number(id))
      .filter((id) => allowed.has(id));
    whereClause.id = { [Op.in]: filtered.length ? filtered : [-1] };
    return { empty: filtered.length === 0 };
  }
  if (whereClause.id != null && typeof whereClause.id !== 'object') {
    const id = Number(whereClause.id);
    if (!ids.includes(id)) {
      whereClause.id = { [Op.in]: [-1] };
      return { empty: true };
    }
    return { empty: false };
  }
  whereClause.id = { [Op.in]: ids };
  return { empty: false };
}

function emptyKanbanColumns() {
  return {
    'À faire': [],
    'En cours': [],
    'En révision': [],
    'Terminé': [],
    'Bloqué': [],
    'Annulé': []
  };
}

async function assertResponsableZoneCanAccessTask(req, taskId) {
  if (!isResponsableZoneRole(req.user?.role)) return true;
  const allowedIds = await getResponsableZoneControleTaskIds(req.user.id);
  return allowedIds.includes(Number(taskId));
}

/** Applique les scopes rôle (RZ puis Manager Bureau). */
async function applyRoleTaskScopes(whereClause, req) {
  const rz = await applyResponsableZoneControleTaskScope(whereClause, req);
  if (rz.empty) return rz;
  return applyManagerBureauTaskScope(whereClause, req);
}

async function assertRoleCanAccessTask(req, taskId) {
  if (!(await assertResponsableZoneCanAccessTask(req, taskId))) return false;
  if (!(await assertManagerBureauCanAccessTask(req, taskId))) return false;
  return true;
}

function roleTaskAccessDeniedMessage(req) {
  if (isResponsableZoneRole(req.user?.role)) {
    return 'Accès limité aux tâches de contrôle que vous avez assignées.';
  }
  return 'Accès limité aux tâches liées aux dossiers de votre bureau international.';
}

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

/* ------------------------------------------------------------------ */
/* Liste / Kanban : filtres communs, catégorie de tâche, pagination    */
/* ------------------------------------------------------------------ */

const KANBAN_COLUMNS = ['À faire', 'En cours', 'En révision', 'Terminé', 'Bloqué', 'Annulé'];
const DONE_COLUMNS = ['Terminé', 'Annulé'];

/** Catégories métier (déduites des tables de liaison). */
const TASK_CATEGORIES = ['traitement_dossier', 'controle_dossier', 'plainte', 'autre'];

const SQL_IS_TRAITEMENT = 'SELECT 1 FROM tbl_assignations_bl ab WHERE ab.task_pro_id = `TaskPro`.`id`';
const SQL_IS_CONTROLE = 'SELECT 1 FROM tbl_assignation_bl_controleur abc WHERE abc.task_pro_id = `TaskPro`.`id`';
const SQL_IS_PLAINTE = 'SELECT 1 FROM tbl_plaintes_tickets_tasks ptt WHERE ptt.task_pro_id = `TaskPro`.`id`';

/** Attributs calculés : catégorie de chaque tâche (renvoyée au client pour les badges). */
const CATEGORY_ATTRIBUTES = [
  [sequelize.literal(`EXISTS(${SQL_IS_TRAITEMENT})`), 'is_traitement_dossier'],
  [sequelize.literal(`EXISTS(${SQL_IS_CONTROLE})`), 'is_controle_dossier'],
  [sequelize.literal(`EXISTS(${SQL_IS_PLAINTE})`), 'is_plainte']
];

function categoryCondition(categorie) {
  switch (categorie) {
    case 'traitement_dossier':
      return sequelize.literal(`EXISTS(${SQL_IS_TRAITEMENT})`);
    case 'controle_dossier':
      return sequelize.literal(`EXISTS(${SQL_IS_CONTROLE})`);
    case 'plainte':
      return sequelize.literal(`EXISTS(${SQL_IS_PLAINTE})`);
    case 'autre':
      return sequelize.literal(
        `NOT EXISTS(${SQL_IS_TRAITEMENT}) AND NOT EXISTS(${SQL_IS_CONTROLE}) AND NOT EXISTS(${SQL_IS_PLAINTE})`
      );
    default:
      return null;
  }
}

function addAndCondition(whereClause, condition) {
  if (!condition) return;
  whereClause[Op.and] = [...(whereClause[Op.and] || []), condition];
}

/** Sérialise une tâche + sa catégorie métier. */
function serializeTaskWithCategory(task) {
  const json = task.toJSON();
  const isTraitement = Boolean(Number(json.is_traitement_dossier));
  const isControle = Boolean(Number(json.is_controle_dossier));
  const isPlainte = Boolean(Number(json.is_plainte));
  delete json.is_traitement_dossier;
  delete json.is_controle_dossier;
  delete json.is_plainte;
  json.categorie = isControle
    ? 'controle_dossier'
    : isTraitement
    ? 'traitement_dossier'
    : isPlainte
    ? 'plainte'
    : 'autre';
  return json;
}

/**
 * Construit le where commun (liste + kanban) à partir de la query.
 * statut_vue : in_progress | completed | overdue (filtré côté serveur pour des comptes justes).
 */
function buildTaskWhere(q) {
  const whereClause = {
    supprime: false,
    archive: q.archive === 'true' || q.archive === true
  };

  const intParam = (v) => {
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  };

  if (q.statut) whereClause.statut = q.statut;
  if (q.colonne_kanban) whereClause.colonne_kanban = q.colonne_kanban;
  if (q.priorite) whereClause.priorite = q.priorite;
  if (q.type_tache) whereClause.type_tache = q.type_tache;
  if (q.assignee_id && intParam(q.assignee_id) != null) whereClause.assignee_id = intParam(q.assignee_id);
  if (q.createur_id && intParam(q.createur_id) != null) whereClause.createur_id = intParam(q.createur_id);
  if (q.projet_id && intParam(q.projet_id) != null) whereClause.projet_id = intParam(q.projet_id);
  if (q.departement_id && intParam(q.departement_id) != null) {
    whereClause.departement_id = intParam(q.departement_id);
  }

  if (q.search && String(q.search).trim() !== '') {
    const term = String(q.search).trim();
    whereClause[Op.or] = [
      { titre: { [Op.like]: `%${term}%` } },
      { description: { [Op.like]: `%${term}%` } },
      { numero_tache: { [Op.like]: `%${term}%` } }
    ];
  }

  if (q.statut_vue === 'in_progress') {
    addAndCondition(whereClause, { colonne_kanban: 'En cours' });
  } else if (q.statut_vue === 'completed') {
    addAndCondition(whereClause, { colonne_kanban: 'Terminé' });
  } else if (q.statut_vue === 'overdue') {
    addAndCondition(whereClause, {
      date_echeance: { [Op.lt]: new Date() },
      colonne_kanban: { [Op.notIn]: DONE_COLUMNS }
    });
  }

  addAndCondition(whereClause, categoryCondition(q.categorie));
  applyDateCreationRange(whereClause, q.date_from, q.date_to);
  return whereClause;
}

const TASK_LIST_INCLUDES = [
  { model: User, as: 'createur', attributes: ['id', 'nom', 'prenom', 'email'] },
  { model: User, as: 'assignee', attributes: ['id', 'nom', 'prenom', 'email'] },
  { model: Departement, as: 'departement', attributes: ['id', 'nom'] },
  { model: SousDepartement, as: 'sous_departement', attributes: ['id', 'nom'] }
];

const TASK_ATTRIBUTES = { exclude: ['client_id'], include: CATEGORY_ATTRIBUTES };

const COMMON_LIST_VALIDATORS = [
  query('priorite').optional({ checkFalsy: true }).isIn(['Basse', 'Normale', 'Haute', 'Urgente']),
  query('categorie').optional({ checkFalsy: true }).isIn(TASK_CATEGORIES),
  query('statut_vue').optional({ checkFalsy: true }).isIn(['in_progress', 'completed', 'overdue']),
  query('assignee_id').optional({ checkFalsy: true }).isInt(),
  query('date_from').optional({ checkFalsy: true }).isISO8601(),
  query('date_to').optional({ checkFalsy: true }).isISO8601()
];

function sendValidationError(res, errors) {
  return res.status(400).json({
    error: 'Validation failed',
    message: 'Paramètres de filtre invalides',
    details: errors.array()
  });
}

/** Compte des tâches en retard pour un where donné (hors colonnes terminées). */
function countOverdue(whereClause) {
  return TaskPro.count({
    where: {
      ...whereClause,
      [Op.and]: [
        ...(whereClause[Op.and] || []),
        { date_echeance: { [Op.lt]: new Date() } },
        { colonne_kanban: { [Op.notIn]: DONE_COLUMNS } }
      ]
    }
  });
}

const LIST_SORTS = {
  date_creation: 'date_creation',
  date_echeance: 'date_echeance',
  priorite: 'priorite',
  titre: 'titre',
  numero_tache: 'numero_tache',
  statut: 'colonne_kanban'
};

// GET /api/task-pro — liste paginée (vue Liste)
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 200 }),
  query('statut').optional({ checkFalsy: true }).isIn(KANBAN_COLUMNS),
  query('colonne_kanban').optional().isString(),
  query('projet_id').optional({ checkFalsy: true }).isInt(),
  query('sort_by').optional({ checkFalsy: true }).isIn(Object.keys(LIST_SORTS)),
  query('sort_dir').optional({ checkFalsy: true }).isIn(['asc', 'desc', 'ASC', 'DESC']),
  ...COMMON_LIST_VALIDATORS
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    const pageNum = parseInt(req.query.page || '1', 10);
    const limitNum = parseInt(req.query.limit || '25', 10);
    const offset = (pageNum - 1) * limitNum;

    const whereClause = buildTaskWhere(req.query);
    const scope = await applyRoleTaskScopes(whereClause, req);
    if (scope.empty) {
      return res.json({ tasks: [], totalItems: 0, totalPages: 0, currentPage: pageNum, limit: limitNum });
    }

    const sortField = LIST_SORTS[req.query.sort_by] || 'date_creation';
    const sortDir = String(req.query.sort_dir || 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const order = [[sortField, sortDir]];
    if (sortField !== 'date_creation') order.push(['date_creation', 'DESC']);

    const { count, rows } = await TaskPro.findAndCountAll({
      where: whereClause,
      attributes: TASK_ATTRIBUTES,
      include: TASK_LIST_INCLUDES,
      limit: limitNum,
      offset,
      order,
      distinct: true
    });

    res.json({
      tasks: rows.map(serializeTaskWithCategory),
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

/**
 * GET /api/task-pro/kanban — tableau paginé par colonne.
 *  - limit_per_column (défaut 25, max 200) : nombre de cartes chargées par colonne.
 *  - colonne + offset : « Charger plus » sur une seule colonne → { colonne, tasks, total, offset }.
 * Réponse complète : { columns, counts, total, en_retard, limit_per_column }.
 */
router.get('/kanban', [
  query('limit_per_column').optional().isInt({ min: 1, max: 200 }),
  query('offset').optional().isInt({ min: 0 }),
  query('colonne').optional({ checkFalsy: true }).isIn(KANBAN_COLUMNS),
  ...COMMON_LIST_VALIDATORS
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    const limitPerColumn = parseInt(req.query.limit_per_column || '25', 10);
    const offset = parseInt(req.query.offset || '0', 10);
    const singleColumn = req.query.colonne || null;

    const whereClause = buildTaskWhere(req.query);
    const scope = await applyRoleTaskScopes(whereClause, req);
    if (scope.empty) {
      if (singleColumn) return res.json({ colonne: singleColumn, tasks: [], total: 0, offset });
      const counts = Object.fromEntries(KANBAN_COLUMNS.map((c) => [c, 0]));
      return res.json({
        columns: emptyKanbanColumns(),
        counts,
        total: 0,
        en_retard: 0,
        limit_per_column: limitPerColumn
      });
    }

    const loadColumn = async (columnName, columnOffset) => {
      const { count, rows } = await TaskPro.findAndCountAll({
        // Comme l’ancien Kanban : colonne_kanban, ou à défaut le statut.
        where: {
          ...whereClause,
          [Op.and]: [
            ...(whereClause[Op.and] || []),
            {
              [Op.or]: [
                { colonne_kanban: columnName },
                { colonne_kanban: null, statut: columnName }
              ]
            }
          ]
        },
        attributes: TASK_ATTRIBUTES,
        include: TASK_LIST_INCLUDES.slice(0, 2),
        order: [['position', 'ASC'], ['date_creation', 'DESC']],
        limit: limitPerColumn,
        offset: columnOffset,
        distinct: true
      });
      return { count, tasks: rows.map(serializeTaskWithCategory) };
    };

    if (singleColumn) {
      const { count, tasks } = await loadColumn(singleColumn, offset);
      return res.json({ colonne: singleColumn, tasks, total: count, offset });
    }

    const [results, enRetard] = await Promise.all([
      Promise.all(KANBAN_COLUMNS.map((c) => loadColumn(c, 0))),
      countOverdue(whereClause)
    ]);

    const columns = emptyKanbanColumns();
    const counts = {};
    KANBAN_COLUMNS.forEach((c, i) => {
      columns[c] = results[i].tasks;
      counts[c] = results[i].count;
    });

    res.json({
      columns,
      counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      en_retard: enRetard,
      limit_per_column: limitPerColumn
    });
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
    const baseWhere = { supprime: false, archive: false };
    await applyRoleTaskScopes(baseWhere, req);

    // Use colonne_kanban for stats to match the Kanban view (more reliable than statut)
    const stats = {
      total: await TaskPro.count({ where: { ...baseWhere } }),
      par_statut: {
        a_faire: await TaskPro.count({ where: { ...baseWhere, colonne_kanban: 'À faire' } }),
        en_cours: await TaskPro.count({ where: { ...baseWhere, colonne_kanban: 'En cours' } }),
        en_revision: await TaskPro.count({ where: { ...baseWhere, colonne_kanban: 'En révision' } }),
        termine: await TaskPro.count({ where: { ...baseWhere, colonne_kanban: 'Terminé' } }),
        bloque: await TaskPro.count({ where: { ...baseWhere, colonne_kanban: 'Bloqué' } }),
        annule: await TaskPro.count({ where: { ...baseWhere, colonne_kanban: 'Annulé' } })
      },
      par_priorite: {
        basse: await TaskPro.count({ where: { ...baseWhere, priorite: 'Basse' } }),
        normale: await TaskPro.count({ where: { ...baseWhere, priorite: 'Normale' } }),
        haute: await TaskPro.count({ where: { ...baseWhere, priorite: 'Haute' } }),
        urgente: await TaskPro.count({ where: { ...baseWhere, priorite: 'Urgente' } })
      },
      en_retard: await TaskPro.count({
        where: {
          ...baseWhere,
          date_echeance: { [Op.lt]: new Date() },
          statut: { [Op.ne]: 'Terminé' }
        }
      }),
      archivees: await TaskPro.count({
        where: (() => {
          const archivedWhere = { ...baseWhere, archive: true };
          return archivedWhere;
        })()
      })
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

    if (!(await assertRoleCanAccessTask(req, task.id))) {
        return res.status(403).json({
          error: 'Forbidden',
          message: roleTaskAccessDeniedMessage(req)
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

    try {
      taskData.dossier_lie = await loadDossierLieForTask(task.id);
    } catch (linkErr) {
      console.error('task-pro dossier_lie:', linkErr.message);
      taskData.dossier_lie = null;
    }

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

    if (!(await assertRoleCanAccessTask(req, task.id))) {
      return res.status(403).json({
        error: 'Forbidden',
        message: roleTaskAccessDeniedMessage(req)
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

    if (!(await assertRoleCanAccessTask(req, task.id))) {
      return res.status(403).json({
        error: 'Forbidden',
        message: roleTaskAccessDeniedMessage(req)
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

    if (!(await assertRoleCanAccessTask(req, task.id))) {
      return res.status(403).json({
        error: 'Forbidden',
        message: roleTaskAccessDeniedMessage(req)
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

    if (!(await assertRoleCanAccessTask(req, task.id))) {
      return res.status(403).json({
        error: 'Forbidden',
        message: roleTaskAccessDeniedMessage(req)
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

    if (!(await assertRoleCanAccessTask(req, task.id))) {
      return res.status(403).json({
        error: 'Forbidden',
        message: roleTaskAccessDeniedMessage(req)
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


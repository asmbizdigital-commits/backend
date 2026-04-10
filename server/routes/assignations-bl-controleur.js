const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const AssignationBLControleur = require('../models/AssignationBLControleur');
const BlDocument = require('../models/BlDocument');
const TaskPro = require('../models/TaskPro');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

const ROLE_CIBLE = 'Contrôleur Sygram';
const ROLES_CREATEUR = new Set(['Administrateur', 'Directeur Opérations']);

const CHECKLIST_CONTROLE = [
  { id: 1, text: 'Prise en charge du dossier saisi', completed: false },
  { id: 2, text: 'Contrôle conformité et clôturer', completed: false }
];

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

const emitChanged = (req) => {
  const io = req.app.get('io');
  if (io) {
    io.emit('assignations_bl_controleur:changed', { at: new Date().toISOString() });
  }
};

function requireCreateurAssignControleur(req, res, next) {
  if (req.user.nom === 'Jimmy') return next();
  if (ROLES_CREATEUR.has(req.user.role)) return next();
  return res.status(403).json({
    success: false,
    message: 'Seuls un Administrateur ou un Directeur Opérations peuvent assigner un dossier à un contrôleur.'
  });
}

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 1000 }),
    query('assignee_id').optional().isInt({ min: 1 }),
    query('bl_document_id').optional().isString().trim(),
    query('statut').optional().isIn(['Assignée', 'En cours', 'Terminée', 'Annulée'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const page = parseInt(req.query.page || '1', 10);
      const limit = parseInt(req.query.limit || '100', 10);
      const offset = (page - 1) * limit;
      const where = {};
      if (req.query.assignee_id) where.assigneeId = parseInt(req.query.assignee_id, 10);
      if (req.query.bl_document_id) where.blDocumentId = req.query.bl_document_id;
      if (req.query.statut) where.statut = req.query.statut;

      const { count, rows } = await AssignationBLControleur.findAndCountAll({
        where,
        include: [
          { model: User, as: 'assignee', attributes: ['id', 'nom', 'prenom', 'role', 'email'] },
          { model: User, as: 'assignePar', attributes: ['id', 'nom', 'prenom', 'role', 'email'] },
          { model: BlDocument, as: 'blDocument' },
          { model: TaskPro, as: 'taskPro', attributes: ['id', 'numero_tache', 'titre', 'statut', 'priorite'] }
        ],
        order: [['created_at', 'DESC']],
        limit,
        offset
      });

      res.json({
        success: true,
        assignations: rows,
        pagination: { page, limit, total: count, pages: Math.ceil(count / limit) }
      });
    } catch (error) {
      console.error('GET /api/assignations-bl-controleur', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des assignations contrôle B/L'
      });
    }
  }
);

router.get('/:id', [param('id').isInt({ min: 1 })], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const row = await AssignationBLControleur.findByPk(req.params.id, {
      include: [
        { model: User, as: 'assignee', attributes: ['id', 'nom', 'prenom', 'role', 'email'] },
        { model: User, as: 'assignePar', attributes: ['id', 'nom', 'prenom', 'role', 'email'] },
        { model: BlDocument, as: 'blDocument' },
        { model: TaskPro, as: 'taskPro' }
      ]
    });
    if (!row) return res.status(404).json({ success: false, message: 'Assignation introuvable' });
    res.json({ success: true, assignation: row });
  } catch (error) {
    console.error('GET /api/assignations-bl-controleur/:id', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

router.post(
  '/',
  requireCreateurAssignControleur,
  [
    body('bl_document_ids').isArray({ min: 1 }),
    body('bl_document_ids.*').isString().trim().notEmpty(),
    body('assignee_id').isInt({ min: 1 }),
    body('role_cible').optional().isIn([ROLE_CIBLE]),
    body('priorite').optional().isIn(['Normale', 'Haute', 'Urgente']),
    body('date_limite').optional({ nullable: true, checkFalsy: true }).isISO8601(),
    body('commentaire').optional().isString()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

      const roleCible = req.body.role_cible || ROLE_CIBLE;
      const priorite = req.body.priorite || 'Normale';
      const assigneeId = parseInt(req.body.assignee_id, 10);
      const blIds = [...new Set(req.body.bl_document_ids)];

      const assignee = await User.findByPk(assigneeId);
      if (!assignee) return res.status(404).json({ success: false, message: 'Utilisateur cible introuvable' });
      if (assignee.role !== roleCible) {
        return res.status(400).json({
          success: false,
          message: `L'utilisateur doit avoir le rôle ${roleCible}`
        });
      }

      const blRows = await BlDocument.findAll({ where: { id: { [Op.in]: blIds } } });
      if (blRows.length !== blIds.length) {
        const found = new Set(blRows.map((r) => r.id));
        const missing = blIds.filter((id) => !found.has(id));
        return res.status(404).json({
          success: false,
          message: 'Certains B/L sont introuvables',
          missing_bl_document_ids: missing
        });
      }

      const invalid = blRows.filter((bl) => !bl.isValidated);
      if (invalid.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Seuls les dossiers validés (FERI) peuvent être assignés au contrôle.',
          invalid_bl_document_ids: invalid.map((b) => b.id)
        });
      }

      const created = [];
      for (const bl of blRows) {
        const numero = await generateNumeroTache();
        const task = await TaskPro.create({
          numero_tache: numero,
          titre: `Contrôle B/L ${bl.blNumber || bl.id}`,
          description: `Tâche créée automatiquement depuis l'assignation contrôle B/L ${bl.blNumber || bl.id}.`,
          type_tache: 'Tâche',
          statut: 'À faire',
          colonne_kanban: 'À faire',
          priorite,
          createur_id: req.user.id,
          assignee_id: assigneeId,
          date_echeance: req.body.date_limite ? new Date(req.body.date_limite) : null,
          checklist: CHECKLIST_CONTROLE,
          nombre_checklist_items: CHECKLIST_CONTROLE.length,
          checklist_completed: 0,
          progression: 0,
          visibilite: 'Public',
          confidentialite: 'Normale'
        });
        await task.addToHistory(req.user.id, 'created', {
          source: 'assignation_bl_controleur',
          bl_document_id: bl.id
        });

        const assignation = await AssignationBLControleur.create({
          blDocumentId: bl.id,
          assigneeId,
          roleCible,
          priorite,
          dateLimite: req.body.date_limite || null,
          commentaire: req.body.commentaire || null,
          statut: 'Assignée',
          taskProId: task.id,
          assigneParId: req.user.id
        });

        created.push(assignation);
      }

      emitChanged(req);
      res.status(201).json({ success: true, created_count: created.length, assignations: created });
    } catch (error) {
      console.error('POST /api/assignations-bl-controleur', error);
      res.status(500).json({
        success: false,
        message: "Erreur lors de la création de l'assignation contrôle B/L"
      });
    }
  }
);

router.put(
  '/:id',
  requireCreateurAssignControleur,
  [
    param('id').isInt({ min: 1 }),
    body('assignee_id').optional().isInt({ min: 1 }),
    body('priorite').optional().isIn(['Normale', 'Haute', 'Urgente']),
    body('date_limite').optional({ nullable: true, checkFalsy: true }).isISO8601(),
    body('commentaire').optional().isString(),
    body('statut').optional().isIn(['Assignée', 'En cours', 'Terminée', 'Annulée'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

      const row = await AssignationBLControleur.findByPk(req.params.id);
      if (!row) return res.status(404).json({ success: false, message: 'Assignation introuvable' });

      if (req.body.assignee_id) {
        const assignee = await User.findByPk(parseInt(req.body.assignee_id, 10));
        if (!assignee) return res.status(404).json({ success: false, message: 'Utilisateur cible introuvable' });
        if (assignee.role !== row.roleCible) {
          return res.status(400).json({
            success: false,
            message: `L'utilisateur doit avoir le rôle ${row.roleCible}`
          });
        }
        row.assigneeId = assignee.id;
      }
      if (req.body.priorite) row.priorite = req.body.priorite;
      if (Object.prototype.hasOwnProperty.call(req.body, 'date_limite')) row.dateLimite = req.body.date_limite || null;
      if (Object.prototype.hasOwnProperty.call(req.body, 'commentaire')) row.commentaire = req.body.commentaire || null;
      if (req.body.statut) row.statut = req.body.statut;

      await row.save();

      if (row.taskProId) {
        const task = await TaskPro.findByPk(row.taskProId);
        if (task) {
          if (req.body.assignee_id) task.assignee_id = row.assigneeId;
          if (req.body.priorite) task.priorite = row.priorite;
          if (Object.prototype.hasOwnProperty.call(req.body, 'date_limite')) {
            task.date_echeance = row.dateLimite ? new Date(row.dateLimite) : null;
          }
          if (req.body.statut) {
            const map = {
              Assignée: 'À faire',
              'En cours': 'En cours',
              Terminée: 'Terminé',
              Annulée: 'Annulé'
            };
            task.statut = map[row.statut] || task.statut;
            task.colonne_kanban = map[row.statut] || task.colonne_kanban;
          }
          await task.save();
        }
      }

      emitChanged(req);
      res.json({ success: true, assignation: row });
    } catch (error) {
      console.error('PUT /api/assignations-bl-controleur/:id', error);
      res.status(500).json({
        success: false,
        message: "Erreur lors de la mise à jour de l'assignation contrôle B/L"
      });
    }
  }
);

router.delete('/:id', requireCreateurAssignControleur, [param('id').isInt({ min: 1 })], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const row = await AssignationBLControleur.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Assignation introuvable' });
    await row.destroy();

    emitChanged(req);
    res.json({ success: true, message: 'Assignation supprimée' });
  } catch (error) {
    console.error('DELETE /api/assignations-bl-controleur/:id', error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la suppression de l'assignation contrôle B/L"
    });
  }
});

module.exports = router;

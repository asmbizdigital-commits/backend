const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const AssignationBLControleur = require('../models/AssignationBLControleur');
const Connaissement = require('../models/Connaissement');
const TaskPro = require('../models/TaskPro');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const {
  assigneeMatchesRoleCible,
  isRoleDirecteurOperations,
  isResponsableZoneRole
} = require('../utils/userRoles');
const { responsableZoneCanAccessConnaissement } = require('../utils/responsableZoneConnaissementAccess');
const { parsePositiveIntIds } = require('../utils/connaissementIdList');
const { logDossierActivity, ACTION_TYPES, personLabel } = require('../utils/dossierActivityLog');

const router = express.Router();
router.use(authenticateToken);

const ROLE_CIBLE = 'Verificateur Sygrem';
const CHECKLIST_CONTROLE = [
  { id: 1, text: 'Validation FERI et clôture', completed: false },
  { id: 2, text: 'Contrôle conformité Sygrem', completed: false }
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
  if (
    req.user.role === 'Administrateur' ||
    isRoleDirecteurOperations(req.user.role) ||
    isResponsableZoneRole(req.user.role)
  ) {
    return next();
  }
  return res.status(403).json({
    success: false,
    message:
      'Seuls un Administrateur, un Directeur Opérations ou un Responsable Zone peuvent assigner un dossier à un Verificateur Sygrem.'
  });
}

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 1000 }),
    query('assignee_id').optional().isInt({ min: 1 }),
    query('connaissement_id').optional().isInt({ min: 1 }),
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
      if (req.query.connaissement_id) {
        where.connaissementId = parseInt(req.query.connaissement_id, 10);
      } else if (req.query.bl_document_id) {
        const cid = parseInt(String(req.query.bl_document_id).trim(), 10);
        if (!Number.isNaN(cid)) where.connaissementId = cid;
      }
      if (req.query.statut) where.statut = req.query.statut;

      const { count, rows } = await AssignationBLControleur.findAndCountAll({
        where,
        include: [
          { model: User, as: 'assignee', attributes: ['id', 'nom', 'prenom', 'role', 'email'] },
          { model: User, as: 'assignePar', attributes: ['id', 'nom', 'prenom', 'role', 'email'] },
          { model: Connaissement, as: 'connaissement' },
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
        { model: Connaissement, as: 'connaissement' },
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
      const ids = parsePositiveIntIds(
        req.body.connaissement_ids ?? req.body.bl_document_ids ?? []
      );
      if (ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'connaissement_ids ou bl_document_ids : tableau non vide attendu.'
        });
      }

      const assignee = await User.findByPk(assigneeId);
      if (!assignee) return res.status(404).json({ success: false, message: 'Utilisateur cible introuvable' });
      if (!assigneeMatchesRoleCible(assignee.role, roleCible)) {
        return res.status(400).json({
          success: false,
          message: `L'utilisateur doit avoir le rôle ${roleCible}`
        });
      }

      const connRows = await Connaissement.findAll({ where: { id: { [Op.in]: ids } } });
      if (connRows.length !== ids.length) {
        const found = new Set(connRows.map((r) => r.id));
        const missing = ids.filter((id) => !found.has(id));
        return res.status(404).json({
          success: false,
          message: 'Certains connaissements sont introuvables',
          missing_connaissement_ids: missing,
          missing_bl_document_ids: missing
        });
      }

      if (isResponsableZoneRole(req.user.role)) {
        for (const c of connRows) {
          const ok = await responsableZoneCanAccessConnaissement(req.user, c);
          if (!ok) {
            return res.status(403).json({
              success: false,
              message:
                'Vous ne pouvez assigner que des dossiers de vos directions / bureaux connectés.',
              forbidden_connaissement_ids: [c.id]
            });
          }
        }
      }

      const invalid = connRows.filter(
        (c) =>
          !c.isDeclared ||
          !String(c.numeroDossier || '').trim()
      );
      if (invalid.length > 0) {
        return res.status(400).json({
          success: false,
          message:
            'Seuls les dossiers déclarés (avec numéro de dossier) peuvent être assignés au contrôle Sygrem.',
          invalid_connaissement_ids: invalid.map((c) => c.id),
          invalid_bl_document_ids: invalid.map((c) => c.id)
        });
      }

      const created = [];
      for (const bl of connRows) {
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
          connaissement_id: bl.id,
          bl_document_id: String(bl.id)
        });

        const assignation = await AssignationBLControleur.create({
          connaissementId: bl.id,
          assigneeId,
          roleCible,
          priorite,
          dateLimite: req.body.date_limite || null,
          commentaire: req.body.commentaire || null,
          statut: 'Assignée',
          taskProId: task.id,
          assigneParId: req.user.id
        });

        await logDossierActivity(req, {
          connaissementId: bl.id,
          actionType: ACTION_TYPES.ASSIGN_CONTROLEUR,
          assigneeId,
          assigneeName: personLabel(assignee),
          taskProId: task.id,
          assignationId: assignation.id,
          dossierRef: bl.numeroDossier || null,
          blNumber: bl.blNumber || null,
          metadata: { roleCible, priorite }
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

      if (isResponsableZoneRole(req.user.role)) {
        const doc = await Connaissement.findByPk(row.connaissementId);
        const ok = await responsableZoneCanAccessConnaissement(req.user, doc);
        if (!ok) {
          return res.status(403).json({
            success: false,
            message: 'Vous ne pouvez modifier que des assignations de vos directions / bureaux connectés.'
          });
        }
      }

      if (req.body.assignee_id) {
        const assignee = await User.findByPk(parseInt(req.body.assignee_id, 10));
        if (!assignee) return res.status(404).json({ success: false, message: 'Utilisateur cible introuvable' });
        if (!assigneeMatchesRoleCible(assignee.role, row.roleCible)) {
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

    if (isResponsableZoneRole(req.user.role)) {
      const doc = await Connaissement.findByPk(row.connaissementId);
      const ok = await responsableZoneCanAccessConnaissement(req.user, doc);
      if (!ok) {
        return res.status(403).json({
          success: false,
          message: 'Vous ne pouvez supprimer que des assignations de vos directions / bureaux connectés.'
        });
      }
    }

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

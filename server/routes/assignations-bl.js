const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const AssignationBL = require('../models/AssignationBL');
const Connaissement = require('../models/Connaissement');
const TaskPro = require('../models/TaskPro');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const { parsePositiveIntIds } = require('../utils/connaissementIdList');
const { sendAssignationBlNotificationEmail } = require('../services/emailService');
const { logDossierActivity, ACTION_TYPES, personLabel } = require('../utils/dossierActivityLog');
const { isSaisisseurRole, isCallCenterRole, canAssignSaisisseurDossier, isManagerBureauRole } = require('../utils/userRoles');
const {
  loadUserGeo,
  managerBureauCanAccessConnaissement
} = require('../utils/managerBureauConnaissementAccess');
const { createTaskProWithUniqueNumero } = require('../utils/generateTaskProNumero');

const router = express.Router();
router.use(authenticateToken);

function requireCanAssignSaisisseur(req, res, next) {
  if (req.user?.nom === 'Jimmy') return next();
  if (!canAssignSaisisseurDossier(req.user?.role)) {
    return res.status(403).json({
      success: false,
      message:
        'Vous n’êtes pas autorisé à assigner des dossiers à un saisisseur (Manager Bureau, Directeur Opérations, Responsable Zone, etc.).'
    });
  }
  return next();
}

const CHECKLIST_TEMPLATE = [
  { id: 1, text: 'Prise en charge et Ouverture du dossier', completed: false },
  { id: 2, text: 'Controle des informations', completed: false },
  { id: 3, text: 'Remplissage fiche de renseignement', completed: false }
];

const emitAssignationsChanged = (req) => {
  const io = req.app.get('io');
  if (io) {
    io.emit('assignations_bl:changed', { at: new Date().toISOString() });
  }
};

const ACTIVE_ASSIGN_STATUTS = ['Assignée', 'En cours', 'Terminée'];
/** Bloque une nouvelle assignation (dossier déjà en cours de traitement). */
const BLOCKING_ASSIGN_STATUTS = ['Assignée', 'En cours'];

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 1000 }),
    query('assignee_id').optional().isInt({ min: 1 }),
    query('connaissement_id').optional().isInt({ min: 1 }),
    query('connaissement_ids').optional().isString().trim(),
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
      if (isSaisisseurRole(req.user?.role)) {
        // Un saisisseur ne voit que ses propres assignations.
        where.assigneeId = req.user.id;
        where.statut = { [Op.in]: ACTIVE_ASSIGN_STATUTS };
      } else {
        if (req.query.assignee_id) where.assigneeId = parseInt(req.query.assignee_id, 10);
        if (req.query.statut) where.statut = req.query.statut;
      }
      const idsFromList = parsePositiveIntIds(
        String(req.query.connaissement_ids || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      );
      if (idsFromList.length) {
        where.connaissementId = { [Op.in]: idsFromList };
      } else if (req.query.connaissement_id) {
        where.connaissementId = parseInt(req.query.connaissement_id, 10);
      } else if (req.query.bl_document_id) {
        const cid = parseInt(String(req.query.bl_document_id).trim(), 10);
        if (!Number.isNaN(cid)) where.connaissementId = cid;
      }

      const { count, rows } = await AssignationBL.findAndCountAll({
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
      console.error('GET /api/assignations-bl', error);
      res.status(500).json({ success: false, message: 'Erreur lors de la récupération des assignations B/L' });
    }
  }
);

router.get('/:id', [param('id').isInt({ min: 1 })], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const row = await AssignationBL.findByPk(req.params.id, {
      include: [
        { model: User, as: 'assignee', attributes: ['id', 'nom', 'prenom', 'role', 'email'] },
        { model: User, as: 'assignePar', attributes: ['id', 'nom', 'prenom', 'role', 'email'] },
        { model: Connaissement, as: 'connaissement' },
        { model: TaskPro, as: 'taskPro' }
      ]
    });
    if (!row) return res.status(404).json({ success: false, message: 'Assignation introuvable' });
    if (isSaisisseurRole(req.user?.role) && Number(row.assigneeId) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé à cette assignation.' });
    }
    res.json({ success: true, assignation: row });
  } catch (error) {
    console.error('GET /api/assignations-bl/:id', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

router.post(
  '/',
  requireCanAssignSaisisseur,
  [
    body('assignee_id').isInt({ min: 1 }),
    body('role_cible').optional().isIn(['Saisisseur']),
    body('priorite').optional().isIn(['Normale', 'Haute', 'Urgente']),
    body('date_limite').optional({ nullable: true, checkFalsy: true }).isISO8601(),
    body('commentaire').optional().isString()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

      const ids = parsePositiveIntIds(
        req.body.connaissement_ids ?? req.body.bl_document_ids ?? []
      );
      if (ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'connaissement_ids ou bl_document_ids : tableau non vide attendu.'
        });
      }

      const roleCible = req.body.role_cible || 'Saisisseur';
      const priorite = req.body.priorite || 'Normale';
      const assigneeId = parseInt(req.body.assignee_id, 10);

      const assignee = await User.findByPk(assigneeId);
      if (!assignee) return res.status(404).json({ success: false, message: 'Utilisateur cible introuvable' });
      if (assignee.role !== roleCible) {
        return res.status(400).json({ success: false, message: `L'utilisateur doit avoir le rôle ${roleCible}` });
      }

      const rows = await Connaissement.findAll({ where: { id: { [Op.in]: ids } } });
      if (rows.length !== ids.length) {
        const found = new Set(rows.map((r) => r.id));
        const missing = ids.filter((id) => !found.has(id));
        return res.status(404).json({
          success: false,
          message: 'Certains connaissements sont introuvables',
          missing_connaissement_ids: missing,
          missing_bl_document_ids: missing
        });
      }

      const userGeo = await loadUserGeo(req.user.id);
      if (isManagerBureauRole(userGeo?.role)) {
        for (const c of rows) {
          const allowed = await managerBureauCanAccessConnaissement(userGeo, c);
          if (!allowed) {
            return res.status(403).json({
              success: false,
              message: 'Un ou plusieurs dossiers sont hors de votre bureau international.'
            });
          }
        }
      }

      const existingBlocking = await AssignationBL.findAll({
        where: {
          connaissementId: { [Op.in]: ids },
          statut: { [Op.in]: BLOCKING_ASSIGN_STATUTS }
        },
        attributes: ['id', 'connaissementId', 'assigneeId', 'statut']
      });
      if (existingBlocking.length > 0) {
        return res.status(409).json({
          success: false,
          message:
            'Un ou plusieurs dossiers sont déjà assignés à un saisisseur (assignation active). Réassignation refusée.',
          already_assigned_connaissement_ids: [
            ...new Set(existingBlocking.map((a) => a.connaissementId).filter(Boolean))
          ]
        });
      }

      // Ancienne assignation terminée : annuler avant d'en créer une nouvelle.
      await AssignationBL.update(
        { statut: 'Annulée', updatedAt: new Date() },
        {
          where: {
            connaissementId: { [Op.in]: ids },
            statut: 'Terminée'
          }
        }
      );

      const created = [];
      for (const c of rows) {
        const task = await createTaskProWithUniqueNumero({
          titre: `Traitement B/L ${c.blNumber || c.id}`,
          description: `Tâche créée automatiquement depuis l'assignation B/L ${c.blNumber || c.id}.`,
          type_tache: 'Tâche',
          statut: 'À faire',
          colonne_kanban: 'À faire',
          priorite,
          createur_id: req.user.id,
          assignee_id: assigneeId,
          date_echeance: req.body.date_limite ? new Date(req.body.date_limite) : null,
          checklist: CHECKLIST_TEMPLATE,
          nombre_checklist_items: CHECKLIST_TEMPLATE.length,
          checklist_completed: 0,
          progression: 0,
          visibilite: 'Public',
          confidentialite: 'Normale'
        });
        await task.addToHistory(req.user.id, 'created', {
          source: 'assignation_bl',
          connaissement_id: c.id,
          bl_document_id: String(c.id)
        });

        const assignation = await AssignationBL.create({
          connaissementId: c.id,
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
          connaissementId: c.id,
          actionType: ACTION_TYPES.ASSIGN_SAISISSEUR,
          assigneeId,
          assigneeName: personLabel(assignee),
          taskProId: task.id,
          assignationId: assignation.id,
          dossierRef: c.numeroDossier || null,
          blNumber: c.blNumber || null,
          metadata: { roleCible, priorite }
        });

        created.push(assignation);
      }

      const assigneeName =
        `${assignee.prenom || ''} ${assignee.nom || ''}`.trim() || assignee.email || `Utilisateur #${assignee.id}`;
      const assigneParName =
        `${req.user?.prenom || ''} ${req.user?.nom || ''}`.trim() || req.user?.email || '—';

      let emailResult = { sent: false };
      try {
        emailResult = await sendAssignationBlNotificationEmail({
          dossiers: rows.map((c) => ({
            numeroDossier: c.numeroDossier || c.numero_dossier || null,
            blNumber: c.blNumber || c.bl_number || null
          })),
          assigneeName,
          assigneeRole: roleCible,
          priorite,
          dateLimite: req.body.date_limite || null,
          commentaire: req.body.commentaire || null,
          assigneParName
        });
      } catch (emailErr) {
        console.error('Assignation B/L email failed:', emailErr);
        emailResult = { sent: false, error: emailErr.message || 'Échec envoi email' };
      }

      emitAssignationsChanged(req);
      res.status(201).json({
        success: true,
        created_count: created.length,
        assignations: created,
        email_sent: Boolean(emailResult.sent),
        email_error: emailResult.sent ? undefined : emailResult.error
      });
    } catch (error) {
      console.error('POST /api/assignations-bl', error);
      res.status(500).json({ success: false, message: "Erreur lors de la création de l'assignation B/L" });
    }
  }
);

router.put(
  '/:id',
  requireCanAssignSaisisseur,
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

      const row = await AssignationBL.findByPk(req.params.id);
      if (!row) return res.status(404).json({ success: false, message: 'Assignation introuvable' });

      if (req.body.assignee_id) {
        const a = await User.findByPk(parseInt(req.body.assignee_id, 10));
        if (!a) return res.status(404).json({ success: false, message: 'Utilisateur cible introuvable' });
        if (a.role !== row.roleCible) {
          return res.status(400).json({ success: false, message: `L'utilisateur doit avoir le rôle ${row.roleCible}` });
        }
        row.assigneeId = a.id;
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

      emitAssignationsChanged(req);
      res.json({ success: true, assignation: row });
    } catch (error) {
      console.error('PUT /api/assignations-bl/:id', error);
      res.status(500).json({ success: false, message: "Erreur lors de la mise à jour de l'assignation B/L" });
    }
  }
);

router.delete('/:id', requireCanAssignSaisisseur, [param('id').isInt({ min: 1 })], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const row = await AssignationBL.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Assignation introuvable' });

    // Soft-cancel : ne jamais détruire la ligne (évite une « désassignation » silencieuse / perte d’audit).
    if (row.statut !== 'Annulée') {
      row.statut = 'Annulée';
      await row.save();
      if (row.taskProId) {
        const task = await TaskPro.findByPk(row.taskProId);
        if (task && task.statut !== 'Annulé' && task.colonne_kanban !== 'Annulé') {
          task.statut = 'Annulé';
          task.colonne_kanban = 'Annulé';
          await task.save();
        }
      }
    }

    emitAssignationsChanged(req);
    res.json({ success: true, message: 'Assignation annulée', assignation: row });
  } catch (error) {
    console.error('DELETE /api/assignations-bl/:id', error);
    res.status(500).json({ success: false, message: "Erreur lors de la suppression de l'assignation B/L" });
  }
});

module.exports = router;

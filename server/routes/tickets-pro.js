const express = require('express');
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const TicketPro = require('../models/TicketPro');
const TaskPro = require('../models/TaskPro');
const PlainteTicketTask = require('../models/PlainteTicketTask');
const Plainte = require('../models/Plainte');
const User = require('../models/User');
const DirectionProvinciale = require('../models/DirectionProvinciale');
const BureauInternational = require('../models/BureauInternational');
const { authenticateToken } = require('../middleware/auth');
const {
  nextTaskProNumeroTache,
  isDuplicateNumeroTacheError
} = require('../utils/generateTaskProNumero');

const router = express.Router();

const ROLE_GESTIONNAIRE_PLAINTES = 'Gestionnaire des Plaintes';
const ROLE_ADMINISTRATEUR = 'Administrateur';
const ROLE_MANAGER_BUREAU = 'Manager Bureau';

const PLAINTE_INCLUDES = [
  {
    model: DirectionProvinciale,
    as: 'DirectionProvinciale',
    attributes: ['id', 'nom', 'code', 'province'],
    required: false
  },
  {
    model: BureauInternational,
    as: 'BureauInternational',
    attributes: ['id', 'nom', 'code', 'pays', 'ville'],
    required: false
  },
  {
    model: User,
    as: 'employe',
    attributes: ['id', 'nom', 'prenom', 'email'],
    required: false
  }
];

function canViewAllPlaintes(role) {
  return role === ROLE_ADMINISTRATEUR || role === ROLE_GESTIONNAIRE_PLAINTES;
}

function isManagerBureauRole(role) {
  return role === ROLE_MANAGER_BUREAU;
}

async function getUserWithGeo(userId) {
  return User.findByPk(userId, {
    attributes: ['id', 'role', 'direction_provinciale_id', 'bureau_international_id', 'zone']
  });
}

async function plainteIsAccessible(user, plainte) {
  if (!plainte || !user) return false;
  if (canViewAllPlaintes(user.role)) return true;
  if (plainte.rapporteur_id === user.id) return true;
  if (isManagerBureauRole(user.role)) {
    const dirOk = !user.direction_provinciale_id
      || plainte.direction_provinciale_id === user.direction_provinciale_id;
    const burOk = !user.bureau_international_id
      || plainte.bureau_international_id === user.bureau_international_id;
    return dirOk && burOk;
  }
  return false;
}

function buildPlaignantLabel(plainte) {
  if (plainte.type_plainte === 'Interne' && plainte.employe) {
    const e = plainte.employe;
    return [e.prenom, e.nom].filter(Boolean).join(' ') || e.email || 'Employé interne';
  }
  const parts = [plainte.plaignant_prenom, plainte.plaignant_nom].filter(Boolean);
  if (parts.length) return parts.join(' ');
  return plainte.plaignant_email || '—';
}

function buildPrefillFromPlainte(plainte) {
  const dir = plainte.DirectionProvinciale;
  const bur = plainte.BureauInternational;
  return {
    plainte_id: plainte.id,
    numero_plainte: plainte.numero_plainte,
    type_plainte: plainte.type_plainte,
    titre: plainte.titre,
    description: plainte.description,
    categorie: plainte.categorie,
    priorite: plainte.priorite,
    statut: plainte.statut,
    zone: plainte.zone || '',
    direction_provinciale_id: plainte.direction_provinciale_id,
    bureau_international_id: plainte.bureau_international_id,
    direction_label: dir
      ? `${dir.nom}${dir.province ? ` — ${dir.province}` : ''}`
      : '—',
    bureau_label: bur
      ? `${bur.nom}${bur.ville ? ` — ${bur.ville}` : ''}`
      : '—',
    plaignant_label: buildPlaignantLabel(plainte),
    plaignant_nom: plainte.plaignant_nom,
    plaignant_prenom: plainte.plaignant_prenom,
    plaignant_email: plainte.plaignant_email,
    assignee_id: plainte.assignee_id || null,
    defaults: {
      titre: `Ticket — ${plainte.numero_plainte} : ${plainte.titre}`,
      priorite: plainte.priorite || 'Normale',
      assignee_id: plainte.assignee_id || null,
      observateurs: [],
      notes_ouverture: '',
      date_echeance: plainte.date_limite || null
    }
  };
}

/**
 * Prochain numéro TICKET-YYYY-NNNN : max existant + 1 (et non count + 1, qui retombe
 * sur un numéro déjà pris dès qu’un ticket a été supprimé).
 */
const generateNumeroTicket = async () => {
  const year = new Date().getFullYear();
  const prefix = `TICKET-${year}-`;
  const [[row]] = await sequelize.query(
    `SELECT MAX(CAST(SUBSTRING(numero_ticket, :startPos) AS UNSIGNED)) AS maxSeq
     FROM tbl_tickets_pro
     WHERE numero_ticket LIKE :likePrefix`,
    { replacements: { startPos: prefix.length + 1, likePrefix: `${prefix}%` } }
  );
  const next = (Number(row?.maxSeq) || 0) + 1;
  return `${prefix}${String(next).padStart(Math.max(4, String(next).length), '0')}`;
};

/** Numéro de tâche partagé avec les assignations B/L (max + 1, pas count + 1). */
const generateNumeroTache = () => nextTaskProNumeroTache();

function isDuplicateNumeroError(err) {
  if (isDuplicateNumeroTacheError(err)) return true;
  const msg = String(err?.message || err?.parent?.sqlMessage || '');
  return msg.includes('numero_ticket');
}

const TICKET_TASK_CHECKLIST_LABELS = [
  'Réception et Enregistrement du Ticket',
  'Analyse et Diagnostic',
  'Résolution et Suivi',
  'Clôture et Amélioration Continue'
];

function buildTicketTaskChecklist() {
  const baseId = Date.now();
  return TICKET_TASK_CHECKLIST_LABELS.map((text, index) => ({
    id: baseId + index,
    text,
    completed: false
  }));
}

function buildTaskDescription({ numeroPlainte, numeroTicket, notesOuverture }) {
  const lines = [
    `Plainte : ${numeroPlainte}`,
    `Ticket : ${numeroTicket}`
  ];
  if (notesOuverture && String(notesOuverture).trim()) {
    lines.push('', 'Notes d\'ouverture :', String(notesOuverture).trim());
  }
  return lines.join('\n');
}

function parseObservateurIds(raw) {
  if (!Array.isArray(raw)) return [];
  const ids = [...new Set(
    raw
      .map((v) => parseInt(String(v), 10))
      .filter((id) => !Number.isNaN(id) && id > 0)
  )];
  return ids;
}

async function validateObservateurs(observateurIds) {
  if (!observateurIds.length) return [];
  const found = await User.findAll({
    where: { id: { [Op.in]: observateurIds } },
    attributes: ['id']
  });
  const foundIds = new Set(found.map((u) => u.id));
  const invalid = observateurIds.filter((id) => !foundIds.has(id));
  if (invalid.length) {
    const err = new Error('Observateurs introuvables');
    err.invalidIds = invalid;
    throw err;
  }
  return observateurIds;
}

router.use(authenticateToken);

// GET /api/tickets-pro/prefill/:plainteId — données de préremplissage depuis une plainte
router.get('/prefill/:plainteId', async (req, res) => {
  try {
    const plainteId = parseInt(req.params.plainteId, 10);
    if (!plainteId || Number.isNaN(plainteId)) {
      return res.status(400).json({ message: 'Identifiant de plainte invalide' });
    }

    const plainte = await Plainte.findByPk(plainteId, { include: PLAINTE_INCLUDES });
    if (!plainte) {
      return res.status(404).json({ message: 'Plainte introuvable' });
    }

    const user = await getUserWithGeo(req.user.id);
    if (!(await plainteIsAccessible(user, plainte))) {
      return res.status(403).json({ message: 'Accès refusé à cette plainte' });
    }

    return res.json({ prefill: buildPrefillFromPlainte(plainte) });
  } catch (error) {
    console.error('GET /tickets-pro/prefill error:', error);
    return res.status(500).json({ message: 'Erreur lors du chargement des données de la plainte' });
  }
});

// POST /api/tickets-pro — créer un ticket à partir d'une plainte
router.post('/', [
  body('plainte_id').isInt({ min: 1 }).withMessage('plainte_id requis'),
  body('titre').trim().isLength({ min: 3, max: 255 }).withMessage('Titre du ticket requis (3-255 caractères)'),
  body('priorite').optional().isIn(['Basse', 'Normale', 'Haute', 'Urgente']),
  body('assignee_id').optional({ nullable: true }).custom((v) => v === null || v === '' || Number.isInteger(Number(v))),
  body('observateurs').optional().isArray().withMessage('observateurs doit être un tableau'),
  body('observateurs.*').optional().isInt({ min: 1 }).withMessage('Identifiant observateur invalide'),
  body('notes_ouverture').optional({ nullable: true }).isString(),
  body('date_echeance').optional({ nullable: true }).isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Données invalides', errors: errors.array() });
    }

    const plainteId = parseInt(req.body.plainte_id, 10);
    const plainte = await Plainte.findByPk(plainteId, { include: PLAINTE_INCLUDES });
    if (!plainte) {
      return res.status(404).json({ message: 'Plainte introuvable' });
    }

    const user = await getUserWithGeo(req.user.id);
    if (!(await plainteIsAccessible(user, plainte))) {
      return res.status(403).json({ message: 'Accès refusé à cette plainte' });
    }

    const assigneeId = req.body.assignee_id === '' || req.body.assignee_id == null
      ? null
      : parseInt(req.body.assignee_id, 10);

    if (assigneeId) {
      const assignee = await User.findByPk(assigneeId);
      if (!assignee) {
        return res.status(400).json({ message: 'Assigné introuvable' });
      }
    }

    let observateurIds;
    try {
      observateurIds = await validateObservateurs(parseObservateurIds(req.body.observateurs));
    } catch (err) {
      if (err.invalidIds) {
        return res.status(400).json({ message: 'Un ou plusieurs observateurs sont introuvables' });
      }
      throw err;
    }

    const checklist = buildTicketTaskChecklist();
    const notesOuverture = req.body.notes_ouverture || null;
    const ticketTitre = req.body.titre.trim();
    const ticketPriorite = req.body.priorite || plainte.priorite || 'Normale';

    // Numéros recalculés à chaque tentative : en cas de collision (création simultanée),
    // la transaction est annulée et on réessaie avec les numéros suivants.
    const createTicketAndTask = async (numero_ticket, numero_tache) => sequelize.transaction(async (transaction) => {
      const ticket = await TicketPro.create({
        numero_ticket,
        plainte_id: plainte.id,
        numero_plainte_ref: plainte.numero_plainte,
        plainte_type: plainte.type_plainte,
        plainte_titre: plainte.titre,
        plainte_description: plainte.description,
        plainte_categorie: plainte.categorie,
        plainte_priorite: plainte.priorite,
        plainte_statut: plainte.statut,
        plainte_zone: plainte.zone,
        direction_provinciale_id: plainte.direction_provinciale_id,
        bureau_international_id: plainte.bureau_international_id,
        plaignant_nom: plainte.plaignant_nom,
        plaignant_prenom: plainte.plaignant_prenom,
        plaignant_email: plainte.plaignant_email,
        titre: ticketTitre,
        priorite: ticketPriorite,
        statut: 'Ouvert',
        createur_id: req.user.id,
        assignee_id: assigneeId,
        observateurs: observateurIds,
        notes_ouverture: notesOuverture,
        date_echeance: req.body.date_echeance || null
      }, { transaction });

      const task = await TaskPro.create({
        numero_tache,
        titre: `Traitement ${numero_ticket} — ${plainte.numero_plainte}`,
        description: buildTaskDescription({
          numeroPlainte: plainte.numero_plainte,
          numeroTicket: numero_ticket,
          notesOuverture
        }),
        type_tache: 'Tâche',
        statut: 'À faire',
        colonne_kanban: 'À faire',
        priorite: ticketPriorite,
        createur_id: req.user.id,
        assignee_id: assigneeId,
        watchers: observateurIds,
        departement_id: plainte.departement_id || null,
        sous_departement_id: plainte.sous_departement_id || null,
        date_echeance: req.body.date_echeance || null,
        checklist,
        nombre_checklist_items: checklist.length,
        checklist_completed: 0,
        progression: 0,
        visibilite: 'Public',
        confidentialite: 'Normale'
      }, { transaction });

      const liaison = await PlainteTicketTask.create({
        plainte_id: plainte.id,
        ticket_pro_id: ticket.id,
        task_pro_id: task.id,
        createur_id: req.user.id
      }, { transaction });

      return { ticket, task, liaison };
    });

    let result;
    let lastDuplicateErr;
    for (let attempt = 0; attempt < 8 && !result; attempt += 1) {
      const numero_ticket = await generateNumeroTicket();
      const numero_tache = await generateNumeroTache();
      try {
        result = await createTicketAndTask(numero_ticket, numero_tache);
      } catch (err) {
        if (!isDuplicateNumeroError(err)) throw err;
        lastDuplicateErr = err;
        console.warn(`POST /tickets-pro: numéro déjà pris (${numero_ticket} / ${numero_tache}), nouvel essai`);
      }
    }
    if (!result) throw lastDuplicateErr || new Error('Numérotation ticket/tâche impossible');

    const created = await TicketPro.findByPk(result.ticket.id, {
      include: [
        { model: Plainte, as: 'plainte', attributes: ['id', 'numero_plainte', 'titre'] },
        { model: User, as: 'createur', attributes: ['id', 'nom', 'prenom', 'email'] },
        { model: User, as: 'assignee', attributes: ['id', 'nom', 'prenom', 'email'] }
      ]
    });

    const taskLoaded = await TaskPro.findByPk(result.task.id, {
      attributes: ['id', 'numero_tache', 'titre', 'statut', 'priorite', 'checklist', 'nombre_checklist_items']
    });

    const observerIds = created.observateurs || [];
    let observateursUsers = [];
    if (observerIds.length) {
      observateursUsers = await User.findAll({
        where: { id: { [Op.in]: observerIds } },
        attributes: ['id', 'nom', 'prenom', 'email']
      });
    }
    const ticketJson = created.toJSON();
    ticketJson.observateursUsers = observateursUsers;

    return res.status(201).json({
      message: 'Ticket et tâche TASKPRO créés avec succès',
      ticket: ticketJson,
      task: taskLoaded ? taskLoaded.toJSON() : null,
      liaison: {
        id: result.liaison.id,
        plainte_id: result.liaison.plainte_id,
        ticket_pro_id: result.liaison.ticket_pro_id,
        task_pro_id: result.liaison.task_pro_id
      }
    });
  } catch (error) {
    console.error('POST /tickets-pro error:', error);
    const detail = error?.parent?.sqlMessage || error?.errors?.[0]?.message || error?.message;
    return res.status(500).json({
      message: 'Erreur lors de la création du ticket',
      detail: detail || undefined
    });
  }
});

// GET /api/tickets-pro/plainte/:plainteId — tickets liés à une plainte
router.get('/plainte/:plainteId', async (req, res) => {
  try {
    const plainteId = parseInt(req.params.plainteId, 10);
    const plainte = await Plainte.findByPk(plainteId);
    if (!plainte) {
      return res.status(404).json({ message: 'Plainte introuvable' });
    }

    const user = await getUserWithGeo(req.user.id);
    if (!(await plainteIsAccessible(user, plainte))) {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    const tickets = await TicketPro.findAll({
      where: { plainte_id: plainteId },
      order: [['created_at', 'DESC']],
      include: [
        { model: User, as: 'createur', attributes: ['id', 'nom', 'prenom'] },
        { model: User, as: 'assignee', attributes: ['id', 'nom', 'prenom'] }
      ]
    });

    return res.json({ tickets });
  } catch (error) {
    console.error('GET /tickets-pro/plainte error:', error);
    return res.status(500).json({ message: 'Erreur lors du chargement des tickets' });
  }
});

// GET /api/tickets-pro/:id — détail d'un ticket
router.get('/:id', async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    if (!ticketId || Number.isNaN(ticketId)) {
      return res.status(400).json({ message: 'Identifiant de ticket invalide' });
    }

    const ticket = await TicketPro.findByPk(ticketId, {
      include: [
        { model: Plainte, as: 'plainte', attributes: ['id', 'numero_plainte', 'titre', 'statut'] },
        { model: User, as: 'createur', attributes: ['id', 'nom', 'prenom', 'email'] },
        { model: User, as: 'assignee', attributes: ['id', 'nom', 'prenom', 'email'] },
        {
          model: PlainteTicketTask,
          as: 'plainteTicketTask',
          attributes: ['id', 'plainte_id', 'task_pro_id', 'created_at'],
          include: [{
            model: TaskPro,
            as: 'taskPro',
            attributes: ['id', 'numero_tache', 'titre', 'statut', 'priorite', 'checklist', 'progression']
          }]
        }
      ]
    });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket introuvable' });
    }

    const plainte = await Plainte.findByPk(ticket.plainte_id);
    const user = await getUserWithGeo(req.user.id);
    if (!(await plainteIsAccessible(user, plainte))) {
      return res.status(403).json({ message: 'Accès refusé à ce ticket' });
    }

    const observerIds = ticket.observateurs || [];
    let observateursUsers = [];
    if (observerIds.length) {
      observateursUsers = await User.findAll({
        where: { id: { [Op.in]: observerIds } },
        attributes: ['id', 'nom', 'prenom', 'email']
      });
    }

    const ticketJson = ticket.toJSON();
    ticketJson.observateursUsers = observateursUsers;

    return res.json({ ticket: ticketJson });
  } catch (error) {
    console.error('GET /tickets-pro/:id error:', error);
    return res.status(500).json({ message: 'Erreur lors du chargement du ticket' });
  }
});

module.exports = router;

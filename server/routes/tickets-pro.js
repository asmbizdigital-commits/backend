const express = require('express');
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const TicketPro = require('../models/TicketPro');
const Plainte = require('../models/Plainte');
const User = require('../models/User');
const DirectionProvinciale = require('../models/DirectionProvinciale');
const BureauInternational = require('../models/BureauInternational');
const { authenticateToken } = require('../middleware/auth');

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
      notes_ouverture: '',
      date_echeance: plainte.date_limite || null
    }
  };
}

const generateNumeroTicket = async () => {
  const year = new Date().getFullYear();
  const count = await TicketPro.count({
    where: {
      created_at: {
        [Op.gte]: new Date(`${year}-01-01`)
      }
    }
  });
  return `TICKET-${year}-${String(count + 1).padStart(4, '0')}`;
};

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

    const numero_ticket = await generateNumeroTicket();
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
      titre: req.body.titre.trim(),
      priorite: req.body.priorite || plainte.priorite || 'Normale',
      statut: 'Ouvert',
      createur_id: req.user.id,
      assignee_id: assigneeId,
      notes_ouverture: req.body.notes_ouverture || null,
      date_echeance: req.body.date_echeance || null
    });

    const created = await TicketPro.findByPk(ticket.id, {
      include: [
        { model: Plainte, as: 'plainte', attributes: ['id', 'numero_plainte', 'titre'] },
        { model: User, as: 'createur', attributes: ['id', 'nom', 'prenom', 'email'] },
        { model: User, as: 'assignee', attributes: ['id', 'nom', 'prenom', 'email'] }
      ]
    });

    return res.status(201).json({ message: 'Ticket créé avec succès', ticket: created });
  } catch (error) {
    console.error('POST /tickets-pro error:', error);
    return res.status(500).json({ message: 'Erreur lors de la création du ticket' });
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

module.exports = router;

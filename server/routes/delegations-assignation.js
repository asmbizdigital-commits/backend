/**
 * /api/delegations-assignation — paramètres d’assignation du Manager Bureau.
 *
 * Le Manager Bureau accorde à un saisisseur de son bureau le droit d’assigner des dossiers
 * à d’autres saisisseurs, pendant une période et selon des conditions.
 */
const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const DelegationAssignation = require('../models/DelegationAssignation');
const User = require('../models/User');
const BureauInternational = require('../models/BureauInternational');
const { authenticateToken } = require('../middleware/auth');
const { isManagerBureauRole, isRoleAdministrateur, isSaisisseurRole } = require('../utils/userRoles');
const { loadUserGeo } = require('../utils/managerBureauConnaissementAccess');
const {
  ALL_PRIORITES,
  getActiveDelegation,
  computeDelegationUsage,
  listAllowedAssignees,
  serializeDelegation,
  normalizeIdList
} = require('../services/delegationAssignationService');
const { notifyAssigneeAssignation } = require('../services/assignationNotificationService');

const router = express.Router();
router.use(authenticateToken);

const USER_ATTRS = ['id', 'nom', 'prenom', 'email', 'role', 'bureau_international_id'];
const INCLUDES = [
  { model: User, as: 'delegataire', attributes: USER_ATTRS },
  { model: User, as: 'accordePar', attributes: ['id', 'nom', 'prenom'] },
  { model: User, as: 'revoquePar', attributes: ['id', 'nom', 'prenom'] }
];

function validationMessage(errors) {
  const first = errors.array()[0];
  return first?.msg && first.msg !== 'Invalid value'
    ? first.msg
    : `Données invalides : ${[...new Set(errors.array().map((e) => e.path))].join(', ')}.`;
}

/** Manager Bureau (son bureau) ou Administrateur (tous les bureaux). */
async function requireDelegationManager(req, res, next) {
  const role = req.user?.role;
  if (isRoleAdministrateur(role)) {
    req.managerBureauId = null;
    return next();
  }
  if (!isManagerBureauRole(role)) {
    return res.status(403).json({
      success: false,
      message: 'Seul le Manager Bureau peut gérer les paramètres d’assignation.'
    });
  }
  const geo = await loadUserGeo(req.user.id);
  const bureauId = Number(geo?.bureau_international_id);
  if (!Number.isFinite(bureauId) || bureauId < 1) {
    return res.status(400).json({
      success: false,
      message: 'Aucun bureau international n’est rattaché à votre compte.'
    });
  }
  req.managerBureauId = bureauId;
  return next();
}

function canManage(req, delegation) {
  return req.managerBureauId == null || Number(delegation.bureauInternationalId) === req.managerBureauId;
}

async function withUsage(d) {
  const usage = await computeDelegationUsage(d);
  return serializeDelegation(d, { usage });
}

function notifyDelegataire(req, delegataireId, title, message) {
  return notifyAssigneeAssignation({
    app: req.app,
    assigneeId: delegataireId,
    createdBy: req.user.id,
    title,
    message,
    link: '/exploitation/suivi-saisi',
    type: 'info',
    refreshEvent: 'delegation_assignation:changed'
  }).catch((err) => console.error('[delegations] notification échouée:', err.message));
}

function fmtDate(d) {
  return new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

/* ------------------------------------------------------------------ */
/* Saisisseur : ma délégation active                                    */
/* ------------------------------------------------------------------ */

// GET /api/delegations-assignation/me
router.get('/me', async (req, res) => {
  try {
    if (!isSaisisseurRole(req.user?.role)) {
      return res.json({ success: true, delegation: null });
    }
    const d = await getActiveDelegation(req.user.id);
    if (!d) return res.json({ success: true, delegation: null });

    const [usage, destinataires, bureau, accordePar] = await Promise.all([
      computeDelegationUsage(d),
      listAllowedAssignees(d),
      BureauInternational.findByPk(d.bureauInternationalId, { attributes: ['id', 'nom', 'ville', 'pays'] }),
      User.findByPk(d.accordeParId, { attributes: ['id', 'nom', 'prenom'] })
    ]);

    return res.json({
      success: true,
      delegation: serializeDelegation(d, {
        usage,
        bureau,
        accordePar,
        destinataires: destinataires.map((u) => ({
          id: u.id,
          nom: u.nom,
          prenom: u.prenom,
          email: u.email,
          role: u.role,
          bureau_international_id: u.bureau_international_id,
          BureauInternational: bureau
        }))
      })
    });
  } catch (error) {
    console.error('GET /delegations-assignation/me', error);
    return res.status(500).json({ success: false, message: 'Erreur lors du chargement de votre délégation.' });
  }
});

/* ------------------------------------------------------------------ */
/* Manager Bureau : gestion                                             */
/* ------------------------------------------------------------------ */

// GET /api/delegations-assignation/saisisseurs — saisisseurs du bureau (formulaire)
router.get('/saisisseurs', requireDelegationManager, async (req, res) => {
  try {
    const where = { actif: true };
    if (req.managerBureauId != null) where.bureau_international_id = req.managerBureauId;
    const users = await User.findAll({
      where,
      attributes: USER_ATTRS,
      include: [{ model: BureauInternational, as: 'BureauInternational', attributes: ['id', 'nom', 'ville', 'pays'] }],
      order: [['nom', 'ASC'], ['prenom', 'ASC']]
    });
    return res.json({ success: true, users: users.filter((u) => isSaisisseurRole(u.role)) });
  } catch (error) {
    console.error('GET /delegations-assignation/saisisseurs', error);
    return res.status(500).json({ success: false, message: 'Erreur lors du chargement des saisisseurs.' });
  }
});

// GET /api/delegations-assignation?statut=active|planifiee|expiree|revoquee
router.get(
  '/',
  requireDelegationManager,
  [query('statut').optional({ checkFalsy: true }).isIn(['active', 'planifiee', 'expiree', 'revoquee'])],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, message: validationMessage(errors) });

      const now = new Date();
      const where = {};
      if (req.managerBureauId != null) where.bureauInternationalId = req.managerBureauId;
      switch (req.query.statut) {
        case 'active':
          Object.assign(where, { revoque: false, dateDebut: { [Op.lte]: now }, dateFin: { [Op.gte]: now } });
          break;
        case 'planifiee':
          Object.assign(where, { revoque: false, dateDebut: { [Op.gt]: now } });
          break;
        case 'expiree':
          Object.assign(where, { revoque: false, dateFin: { [Op.lt]: now } });
          break;
        case 'revoquee':
          where.revoque = true;
          break;
        default:
          break;
      }

      const rows = await DelegationAssignation.findAll({
        where,
        include: INCLUDES,
        order: [['revoque', 'ASC'], ['dateFin', 'DESC']],
        limit: 500
      });
      const delegations = await Promise.all(rows.map(withUsage));
      return res.json({ success: true, delegations });
    } catch (error) {
      console.error('GET /delegations-assignation', error);
      return res.status(500).json({ success: false, message: 'Erreur lors du chargement des délégations.' });
    }
  }
);

const DELEGATION_VALIDATORS = [
  body('date_debut').isISO8601().withMessage('Date de début invalide.'),
  body('date_fin').isISO8601().withMessage('Date de fin invalide.'),
  body('max_dossiers_par_jour')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1, max: 10000 })
    .withMessage('Quota journalier : nombre entier positif.'),
  body('max_dossiers_total')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1, max: 100000 })
    .withMessage('Quota total : nombre entier positif.'),
  body('priorites_autorisees').optional({ nullable: true }).isArray(),
  body('priorites_autorisees.*').optional().isIn(ALL_PRIORITES),
  body('portee').optional().isIn(['bureau', 'liste']),
  body('destinataire_ids').optional({ nullable: true }).isArray(),
  body('destinataire_ids.*').optional().isInt({ min: 1 }),
  body('peut_s_auto_assigner').optional().isBoolean(),
  body('commentaire').optional({ nullable: true }).isString().isLength({ max: 2000 })
];

/** Valide et normalise les champs ; renvoie { error } ou { values }. */
async function buildDelegationValues(req, delegataire, excludeId = null) {
  const dateDebut = new Date(req.body.date_debut);
  const dateFin = new Date(req.body.date_fin);
  if (!(dateFin > dateDebut)) return { error: 'La date de fin doit être postérieure à la date de début.' };
  if (dateFin < new Date()) return { error: 'La période est déjà terminée.' };

  const portee = req.body.portee === 'liste' ? 'liste' : 'bureau';
  const destinataireIds = portee === 'liste' ? normalizeIdList(req.body.destinataire_ids) : null;
  if (portee === 'liste') {
    if (!destinataireIds.length) return { error: 'Choisissez au moins un saisisseur destinataire.' };
    const dest = await User.findAll({
      where: { id: { [Op.in]: destinataireIds } },
      attributes: ['id', 'role', 'bureau_international_id']
    });
    const invalid = dest.length !== destinataireIds.length ||
      dest.some(
        (u) => !isSaisisseurRole(u.role) ||
          Number(u.bureau_international_id) !== Number(delegataire.bureau_international_id)
      );
    if (invalid) return { error: 'Les destinataires doivent être des saisisseurs du même bureau.' };
  }

  const priorites = Array.isArray(req.body.priorites_autorisees)
    ? [...new Set(req.body.priorites_autorisees.filter((p) => ALL_PRIORITES.includes(p)))]
    : null;
  if (Array.isArray(req.body.priorites_autorisees) && !priorites.length) {
    return { error: 'Autorisez au moins une priorité.' };
  }

  // Une seule délégation non révoquée à la fois par saisisseur sur une même période
  const overlapWhere = {
    delegataireId: delegataire.id,
    revoque: false,
    dateDebut: { [Op.lt]: dateFin },
    dateFin: { [Op.gt]: dateDebut }
  };
  if (excludeId) overlapWhere.id = { [Op.ne]: excludeId };
  const overlap = await DelegationAssignation.findOne({ where: overlapWhere });
  if (overlap) {
    return {
      error: `Ce saisisseur a déjà une délégation sur cette période (du ${fmtDate(overlap.dateDebut)} au ${fmtDate(overlap.dateFin)}).`
    };
  }

  const toInt = (v) => (v === '' || v == null ? null : parseInt(v, 10));
  return {
    values: {
      dateDebut,
      dateFin,
      maxDossiersParJour: toInt(req.body.max_dossiers_par_jour),
      maxDossiersTotal: toInt(req.body.max_dossiers_total),
      prioritesAutorisees: priorites && priorites.length < ALL_PRIORITES.length ? priorites : null,
      portee,
      destinataireIds,
      peutSAutoAssigner: req.body.peut_s_auto_assigner !== false && req.body.peut_s_auto_assigner !== 'false',
      commentaire: req.body.commentaire ? String(req.body.commentaire).trim() : null
    }
  };
}

// POST /api/delegations-assignation
router.post(
  '/',
  requireDelegationManager,
  [body('delegataire_id').isInt({ min: 1 }).withMessage('Choisissez le saisisseur.'), ...DELEGATION_VALIDATORS],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, message: validationMessage(errors) });

      const delegataire = await User.findByPk(parseInt(req.body.delegataire_id, 10), { attributes: USER_ATTRS });
      if (!delegataire || !isSaisisseurRole(delegataire.role)) {
        return res.status(400).json({ success: false, message: 'Le délégataire doit être un saisisseur.' });
      }
      const bureauId = Number(delegataire.bureau_international_id);
      if (!Number.isFinite(bureauId) || bureauId < 1) {
        return res.status(400).json({ success: false, message: 'Ce saisisseur n’est rattaché à aucun bureau.' });
      }
      if (req.managerBureauId != null && bureauId !== req.managerBureauId) {
        return res.status(403).json({ success: false, message: 'Ce saisisseur n’appartient pas à votre bureau.' });
      }

      const { error, values } = await buildDelegationValues(req, delegataire);
      if (error) return res.status(400).json({ success: false, message: error });

      const created = await DelegationAssignation.create({
        ...values,
        delegataireId: delegataire.id,
        accordeParId: req.user.id,
        bureauInternationalId: bureauId
      });

      notifyDelegataire(
        req,
        delegataire.id,
        'Droit d’assignation accordé',
        `Vous pouvez assigner des dossiers à d’autres saisisseurs du ${fmtDate(values.dateDebut)} au ${fmtDate(values.dateFin)}.`
      );

      const full = await DelegationAssignation.findByPk(created.id, { include: INCLUDES });
      return res.status(201).json({ success: true, delegation: await withUsage(full) });
    } catch (error) {
      console.error('POST /delegations-assignation', error);
      return res.status(500).json({ success: false, message: 'Erreur lors de la création de la délégation.' });
    }
  }
);

// PUT /api/delegations-assignation/:id
router.put(
  '/:id',
  requireDelegationManager,
  [param('id').isInt({ min: 1 }), ...DELEGATION_VALIDATORS],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, message: validationMessage(errors) });

      const d = await DelegationAssignation.findByPk(req.params.id);
      if (!d) return res.status(404).json({ success: false, message: 'Délégation introuvable.' });
      if (!canManage(req, d)) return res.status(403).json({ success: false, message: 'Délégation hors de votre bureau.' });
      if (d.revoque) return res.status(400).json({ success: false, message: 'Une délégation révoquée ne peut plus être modifiée.' });

      const delegataire = await User.findByPk(d.delegataireId, { attributes: USER_ATTRS });
      const { error, values } = await buildDelegationValues(req, delegataire, d.id);
      if (error) return res.status(400).json({ success: false, message: error });

      await d.update(values);
      notifyDelegataire(
        req,
        d.delegataireId,
        'Droit d’assignation modifié',
        `Vos conditions d’assignation ont été mises à jour (jusqu’au ${fmtDate(values.dateFin)}).`
      );

      const full = await DelegationAssignation.findByPk(d.id, { include: INCLUDES });
      return res.json({ success: true, delegation: await withUsage(full) });
    } catch (error) {
      console.error('PUT /delegations-assignation/:id', error);
      return res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour de la délégation.' });
    }
  }
);

// POST /api/delegations-assignation/:id/revoquer
router.post('/:id/revoquer', requireDelegationManager, [param('id').isInt({ min: 1 })], async (req, res) => {
  try {
    const d = await DelegationAssignation.findByPk(req.params.id, { include: INCLUDES });
    if (!d) return res.status(404).json({ success: false, message: 'Délégation introuvable.' });
    if (!canManage(req, d)) return res.status(403).json({ success: false, message: 'Délégation hors de votre bureau.' });
    if (d.revoque) return res.json({ success: true, delegation: await withUsage(d) });

    await d.update({ revoque: true, revoqueLe: new Date(), revoqueParId: req.user.id });
    notifyDelegataire(
      req,
      d.delegataireId,
      'Droit d’assignation retiré',
      'Votre Manager Bureau a retiré votre droit d’assigner des dossiers.'
    );

    const full = await DelegationAssignation.findByPk(d.id, { include: INCLUDES });
    return res.json({ success: true, delegation: await withUsage(full) });
  } catch (error) {
    console.error('POST /delegations-assignation/:id/revoquer', error);
    return res.status(500).json({ success: false, message: 'Erreur lors de la révocation.' });
  }
});

module.exports = router;

/**
 * Délégation du droit d’assigner (Manager Bureau → Saisisseur).
 *
 * Un saisisseur délégataire peut, pendant la période définie par son Manager Bureau,
 * assigner des dossiers de SON bureau international à d’autres saisisseurs, dans
 * la limite des conditions : quotas (par jour / sur la période), priorités autorisées,
 * destinataires autorisés et auto-assignation.
 */
const { Op } = require('sequelize');
const DelegationAssignation = require('../models/DelegationAssignation');
const AssignationBL = require('../models/AssignationBL');
const User = require('../models/User');
const { isSaisisseurRole } = require('../utils/userRoles');

const ALL_PRIORITES = ['Normale', 'Haute', 'Urgente'];

/** Statut calculé : planifiee | active | expiree | revoquee */
function delegationStatus(d, now = new Date()) {
  if (!d) return null;
  if (d.revoque) return 'revoquee';
  if (new Date(d.dateDebut) > now) return 'planifiee';
  if (new Date(d.dateFin) < now) return 'expiree';
  return 'active';
}

/** Délégation active (non révoquée, période en cours) pour un utilisateur, ou null. */
async function getActiveDelegation(userId, now = new Date()) {
  const uid = parseInt(userId, 10);
  if (!Number.isFinite(uid) || uid < 1) return null;
  return DelegationAssignation.findOne({
    where: {
      delegataireId: uid,
      revoque: false,
      dateDebut: { [Op.lte]: now },
      dateFin: { [Op.gte]: now }
    },
    order: [['dateFin', 'DESC']]
  });
}

/** Délégation active seulement si l’utilisateur est saisisseur (sinon null, sans requête). */
async function getActiveDelegationForUser(user) {
  if (!user || !isSaisisseurRole(user.role)) return null;
  return getActiveDelegation(user.id);
}

function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

/** Dossiers assignés par le délégataire : aujourd’hui et sur la période de la délégation. */
async function computeDelegationUsage(d, now = new Date()) {
  const base = { assigneParId: d.delegataireId };
  const periodStart = new Date(d.dateDebut);
  const todayStart = startOfToday(now);
  const [total, today] = await Promise.all([
    AssignationBL.count({
      where: { ...base, createdAt: { [Op.gte]: periodStart, [Op.lte]: new Date(d.dateFin) } }
    }),
    AssignationBL.count({
      where: {
        ...base,
        createdAt: { [Op.gte]: todayStart > periodStart ? todayStart : periodStart, [Op.lte]: now }
      }
    })
  ]);
  return {
    total,
    today,
    restantTotal: d.maxDossiersTotal != null ? Math.max(0, d.maxDossiersTotal - total) : null,
    restantAujourdhui: d.maxDossiersParJour != null ? Math.max(0, d.maxDossiersParJour - today) : null
  };
}

function normalizeIdList(raw) {
  let list = raw;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      list = [];
    }
  }
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((v) => parseInt(v, 10)).filter((n) => Number.isFinite(n) && n > 0))];
}

function prioritesOf(d) {
  const list = Array.isArray(d.prioritesAutorisees)
    ? d.prioritesAutorisees
    : typeof d.prioritesAutorisees === 'string'
    ? (() => {
        try {
          return JSON.parse(d.prioritesAutorisees);
        } catch {
          return null;
        }
      })()
    : null;
  const valid = (list || []).filter((p) => ALL_PRIORITES.includes(p));
  return valid.length ? valid : ALL_PRIORITES;
}

/** Saisisseurs (actifs) du bureau de la délégation que le délégataire peut choisir. */
async function listAllowedAssignees(d) {
  const users = await User.findAll({
    where: { bureau_international_id: d.bureauInternationalId, actif: true },
    attributes: ['id', 'nom', 'prenom', 'email', 'role', 'bureau_international_id'],
    order: [['nom', 'ASC'], ['prenom', 'ASC']]
  });
  const allowedIds = d.portee === 'liste' ? new Set(normalizeIdList(d.destinataireIds)) : null;
  return users.filter((u) => {
    if (!isSaisisseurRole(u.role)) return false;
    if (String(u.id) === String(d.delegataireId)) return Boolean(d.peutSAutoAssigner);
    if (allowedIds) return allowedIds.has(Number(u.id));
    return true;
  });
}

/**
 * Vérifie qu’une assignation demandée respecte la délégation.
 * @returns {Promise<string|null>} message d’erreur, ou null si autorisée.
 */
async function checkDelegatedAssignment(d, { assignee, connaissements, priorite }) {
  const now = new Date();
  if (delegationStatus(d, now) !== 'active') {
    return 'Votre délégation d’assignation n’est plus active.';
  }

  const bureauId = Number(d.bureauInternationalId);
  const horsBureau = (connaissements || []).filter(
    (c) => Number(c.bureauConnaissement ?? c.bureau_connaissement) !== bureauId
  );
  if (horsBureau.length) {
    return 'Un ou plusieurs dossiers sont hors du bureau international de votre délégation.';
  }

  if (!assignee || !isSaisisseurRole(assignee.role)) {
    return 'Vous ne pouvez assigner qu’à un saisisseur.';
  }
  if (Number(assignee.bureau_international_id) !== bureauId) {
    return 'Le saisisseur choisi n’appartient pas au bureau de votre délégation.';
  }
  if (String(assignee.id) === String(d.delegataireId)) {
    if (!d.peutSAutoAssigner) return 'Votre délégation ne vous autorise pas à vous assigner des dossiers.';
  } else if (d.portee === 'liste') {
    const allowed = new Set(normalizeIdList(d.destinataireIds));
    if (!allowed.has(Number(assignee.id))) {
      return 'Ce saisisseur ne fait pas partie des destinataires autorisés par votre délégation.';
    }
  }

  const prioOk = prioritesOf(d);
  if (!prioOk.includes(priorite || 'Normale')) {
    return `Priorité non autorisée par votre délégation (autorisées : ${prioOk.join(', ')}).`;
  }

  const n = (connaissements || []).length;
  const usage = await computeDelegationUsage(d, now);
  if (d.maxDossiersParJour != null && usage.today + n > d.maxDossiersParJour) {
    return `Quota journalier atteint : ${usage.today}/${d.maxDossiersParJour} dossier(s) déjà assigné(s) aujourd’hui (reste ${Math.max(0, d.maxDossiersParJour - usage.today)}).`;
  }
  if (d.maxDossiersTotal != null && usage.total + n > d.maxDossiersTotal) {
    return `Quota de la délégation atteint : ${usage.total}/${d.maxDossiersTotal} dossier(s) déjà assigné(s) (reste ${Math.max(0, d.maxDossiersTotal - usage.total)}).`;
  }
  return null;
}

/** Représentation JSON enrichie (statut, priorités normalisées, destinataires en liste). */
function serializeDelegation(d, extra = {}) {
  const json = typeof d.toJSON === 'function' ? d.toJSON() : { ...d };
  return {
    ...json,
    statut: delegationStatus(d),
    prioritesAutorisees: prioritesOf(d),
    destinataireIds: normalizeIdList(d.destinataireIds),
    ...extra
  };
}

module.exports = {
  ALL_PRIORITES,
  delegationStatus,
  getActiveDelegation,
  getActiveDelegationForUser,
  computeDelegationUsage,
  listAllowedAssignees,
  checkDelegatedAssignment,
  serializeDelegation,
  normalizeIdList
};

const DossierActivityLog = require('../models/DossierActivityLog');
const Connaissement = require('../models/Connaissement');

/** Types d’actions trackées (pipeline FERI). */
const ACTION_TYPES = {
  ASSIGN_SAISISSEUR: 'assign_saisisseur',
  EXPORT_SYGREM: 'export_sygrem',
  ADD_DECLARATION: 'add_declaration',
  CHECKLIST_SAISISSEUR: 'checklist_saisisseur',
  ASSIGN_CONTROLEUR: 'assign_controleur',
  CONTROLE_VALIDATION: 'controle_validation',
  ADD_FERI: 'add_feri',
  CHECKLIST_CONTROLEUR: 'checklist_controleur'
};

const ACTION_LABELS_FR = {
  [ACTION_TYPES.ASSIGN_SAISISSEUR]: 'Assignation au saisisseur',
  [ACTION_TYPES.EXPORT_SYGREM]: 'Export vers Sygrem',
  [ACTION_TYPES.ADD_DECLARATION]: 'Numéro de déclaration',
  [ACTION_TYPES.CHECKLIST_SAISISSEUR]: 'Checklist saisisseur',
  [ACTION_TYPES.ASSIGN_CONTROLEUR]: 'Assignation au vérificateur',
  [ACTION_TYPES.CONTROLE_VALIDATION]: 'Validation contrôle',
  [ACTION_TYPES.ADD_FERI]: 'Numéro FERI',
  [ACTION_TYPES.CHECKLIST_CONTROLEUR]: 'Checklist vérificateur'
};

function personLabel(user) {
  if (!user) return null;
  const n = `${user.prenom || ''} ${user.nom || ''}`.trim();
  return n || user.email || (user.id != null ? `#${user.id}` : null);
}

/**
 * SLA cibles (ms) pour l’évaluation — phase test.
 * Au-delà = caution / critique.
 */
const SLA_MS = {
  [ACTION_TYPES.ASSIGN_SAISISSEUR]: 5 * 60 * 1000,
  [ACTION_TYPES.EXPORT_SYGREM]: 45 * 60 * 1000,
  [ACTION_TYPES.ADD_DECLARATION]: 30 * 60 * 1000,
  [ACTION_TYPES.CHECKLIST_SAISISSEUR]: 20 * 60 * 1000,
  [ACTION_TYPES.ASSIGN_CONTROLEUR]: 15 * 60 * 1000,
  [ACTION_TYPES.CONTROLE_VALIDATION]: 40 * 60 * 1000,
  [ACTION_TYPES.ADD_FERI]: 25 * 60 * 1000,
  [ACTION_TYPES.CHECKLIST_CONTROLEUR]: 20 * 60 * 1000
};

function scoreFromDuration(actionType, durationMs) {
  if (durationMs == null || Number.isNaN(durationMs)) return 'unknown';
  const sla = SLA_MS[actionType] || 30 * 60 * 1000;
  if (durationMs <= sla) return 'good';
  if (durationMs <= sla * 2) return 'warn';
  return 'critical';
}

/**
 * Enregistre une action dossier + durée depuis la dernière action du même dossier.
 * N’échoue jamais l’appelant (erreurs loguées).
 */
async function logDossierActivity(req, payload = {}) {
  try {
    const {
      connaissementId,
      actionType,
      assigneeId = null,
      assigneeName = null,
      taskProId = null,
      assignationId = null,
      metadata = null,
      dossierRef = null,
      blNumber = null,
      referenceAt = null
    } = payload;

    if (!connaissementId || !actionType) return null;

    let resolvedRef = dossierRef;
    let resolvedBl = blNumber;
    if ((!resolvedRef || !resolvedBl) && connaissementId) {
      const doc = await Connaissement.findByPk(connaissementId, {
        attributes: ['id', 'numeroDossier', 'blNumber']
      });
      if (doc) {
        resolvedRef = resolvedRef || doc.numeroDossier || null;
        resolvedBl = resolvedBl || doc.blNumber || null;
      }
    }

    const last = await DossierActivityLog.findOne({
      where: { connaissementId },
      order: [['createdAt', 'DESC'], ['id', 'DESC']]
    });

    const now = new Date();
    const refAt = referenceAt ? new Date(referenceAt) : last?.createdAt || null;
    let durationMs = null;
    if (refAt && !Number.isNaN(refAt.getTime())) {
      durationMs = Math.max(0, now.getTime() - refAt.getTime());
    }

    const actor = req?.user || null;
    const row = await DossierActivityLog.create({
      connaissementId,
      actionType,
      actorId: actor?.id ?? null,
      actorName: personLabel(actor),
      actorRole: actor?.role ?? null,
      assigneeId,
      assigneeName,
      taskProId,
      assignationId,
      dossierRef: resolvedRef,
      blNumber: resolvedBl,
      metadata,
      durationMs,
      referenceAt: refAt,
      createdAt: now
    });

    const event = {
      id: row.id,
      connaissementId: row.connaissementId,
      actionType: row.actionType,
      actionLabel: ACTION_LABELS_FR[row.actionType] || row.actionType,
      actorId: row.actorId,
      actorName: row.actorName,
      actorRole: row.actorRole,
      assigneeId: row.assigneeId,
      assigneeName: row.assigneeName,
      taskProId: row.taskProId,
      assignationId: row.assignationId,
      dossierRef: row.dossierRef,
      blNumber: row.blNumber,
      metadata: row.metadata,
      durationMs: row.durationMs,
      referenceAt: row.referenceAt,
      createdAt: row.createdAt,
      score: scoreFromDuration(row.actionType, row.durationMs),
      at: now.toISOString()
    };

    const io = req?.app?.get?.('io');
    if (io) {
      io.emit('dossier_activity:created', event);
    }

    return event;
  } catch (err) {
    console.error('[dossierActivityLog] logDossierActivity failed:', err.message);
    return null;
  }
}

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

module.exports = {
  ACTION_TYPES,
  ACTION_LABELS_FR,
  SLA_MS,
  scoreFromDuration,
  logDossierActivity,
  personLabel,
  startOfDay,
  endOfDay
};

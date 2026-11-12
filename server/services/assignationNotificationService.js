/**
 * Notifications temps réel pour assignations B/L (saisisseur / contrôleur Sygrem).
 * Émet à la fois dans la room user_* et en broadcast filtré côté client
 * (filet de sécurité si le join room a échoué).
 */
const Notification = require('../models/Notification');

/**
 * @param {{
 *   app: object,
 *   assigneeId: number,
 *   createdBy?: number|null,
 *   title: string,
 *   message: string,
 *   link: string,
 *   type?: string,
 *   refreshEvent?: string|null
 * }} opts
 */
async function notifyAssigneeAssignation(opts) {
  const {
    app,
    assigneeId,
    createdBy = null,
    title,
    message,
    link,
    type = 'info',
    refreshEvent = null
  } = opts;

  const uid = parseInt(assigneeId, 10);
  if (!Number.isFinite(uid) || uid < 1) {
    console.warn('[assignationNotification] assigneeId invalide:', assigneeId);
    return null;
  }

  const targetRoles = [`user:${uid}`];
  const notif = await Notification.create({
    title,
    message,
    type,
    link: link || null,
    target_roles: JSON.stringify(targetRoles),
    created_by: createdBy || null
  });

  const io = app && typeof app.get === 'function' ? app.get('io') : null;
  if (!io) {
    console.warn('[assignationNotification] Socket.io indisponible (app.get("io"))');
    return notif;
  }

  const payload = {
    id: notif.id,
    title,
    message,
    type,
    link: link || null,
    target_roles: targetRoles,
    created_at: notif.created_at || new Date().toISOString(),
    kind: 'assignation'
  };

  // 1) Room personnelle (idéal)
  io.to(`user_${uid}`).emit('notification', payload);
  // 2) Broadcast + filtre client (si le socket n’a pas rejoint la room)
  io.emit('notification', payload);

  if (refreshEvent) {
    const refreshPayload = {
      at: new Date().toISOString(),
      assigneeId: uid,
      reason: 'assignation'
    };
    io.to(`user_${uid}`).emit(refreshEvent, refreshPayload);
    io.emit(refreshEvent, refreshPayload);
  }

  console.log(`[assignationNotification] notif #${notif.id} → user_${uid} (${title})`);
  return notif;
}

async function notifySaisisseurAssignation(opts) {
  const count = Math.max(1, parseInt(opts.count, 10) || 1);
  const dossiersLabel = opts.dossiersLabel || (count > 1 ? `${count} dossiers` : '1 dossier');
  return notifyAssigneeAssignation({
    app: opts.app,
    assigneeId: opts.assigneeId,
    createdBy: opts.createdBy,
    title: 'Nouveau dossier assigné',
    message:
      count > 1
        ? `${dossiersLabel} vous ont été assignés pour saisie.`
        : `Un dossier (${dossiersLabel}) vous a été assigné pour saisie.`,
    link: '/exploitation/traitement-dossiers',
    type: 'urgent',
    refreshEvent: 'assignations_bl:changed'
  });
}

async function notifyControleurAssignation(opts) {
  const count = Math.max(1, parseInt(opts.count, 10) || 1);
  const dossiersLabel = opts.dossiersLabel || (count > 1 ? `${count} dossiers` : '1 dossier');
  return notifyAssigneeAssignation({
    app: opts.app,
    assigneeId: opts.assigneeId,
    createdBy: opts.createdBy,
    title: 'Nouveau dossier à contrôler',
    message:
      count > 1
        ? `${dossiersLabel} vous ont été assignés pour contrôle Sygrem.`
        : `Un dossier (${dossiersLabel}) vous a été assigné pour contrôle Sygrem.`,
    link: '/exploitation/controle-dossiers',
    type: 'urgent',
    refreshEvent: 'assignations_bl_controleur:changed'
  });
}

module.exports = {
  notifyAssigneeAssignation,
  notifySaisisseurAssignation,
  notifyControleurAssignation
};

/**
 * Notifications pour les étapes du circuit de dépenses.
 * Cible : demandeur, superviseur, Auditeur, Superviseur Finance, Patron.
 */
const Notification = require('../models/Notification');
const User = require('../models/User');
const SoumissionBesoins = require('../models/SoumissionBesoins');

const ROLES_CONCERNES = ['Auditeur', 'Superviseur Finance', 'Patron'];

/**
 * Récupère les IDs utilisateurs concernés par le circuit (demandeur, superviseur + rôles).
 * @param {{ demandeur_id?: number, superviseur_id?: number }} ctx
 * @returns {Promise<number[]>}
 */
async function getConcernedUserIds(ctx) {
  const ids = new Set();
  if (ctx.demandeur_id) ids.add(ctx.demandeur_id);
  if (ctx.superviseur_id) ids.add(ctx.superviseur_id);
  const users = await User.findAll({
    where: { role: ROLES_CONCERNES },
    attributes: ['id']
  });
  users.forEach(u => ids.add(u.id));
  return Array.from(ids);
}

/**
 * Récupère demandeur_id et superviseur_id à partir du circuit_ref (ex: SB-8).
 * @param {string} circuitRef
 * @returns {Promise<{ demandeur_id: number, superviseur_id: number } | null>}
 */
async function getCircuitContextFromRef(circuitRef) {
  const match = (circuitRef || '').match(/^SB-(\d+)$/);
  if (!match) return null;
  const s = await SoumissionBesoins.findByPk(match[1], { attributes: ['demandeur_id', 'superviseur_id'] });
  if (!s) return null;
  return { demandeur_id: s.demandeur_id, superviseur_id: s.superviseur_id };
}

/**
 * Envoie une notification pour une étape du circuit à tous les concernés.
 * @param {{ title: string, message: string, link?: string, demandeur_id?: number, superviseur_id?: number, created_by?: number, app: object }} opts
 */
async function notifyCircuitStep(opts) {
  const { title, message, link, demandeur_id, superviseur_id, created_by, app } = opts;
  const ctx = { demandeur_id: demandeur_id || null, superviseur_id: superviseur_id || null };
  const userIds = await getConcernedUserIds(ctx);
  const targetRoles = [
    ...(ctx.demandeur_id ? ['user:' + ctx.demandeur_id] : []),
    ...(ctx.superviseur_id ? ['user:' + ctx.superviseur_id] : []),
    ...ROLES_CONCERNES
  ];
  const notifPayload = {
    title,
    message,
    type: 'info',
    link: link || '/circuits-depenses',
    target_roles: JSON.stringify(targetRoles),
    created_by: created_by || null
  };
  const notif = await Notification.create(notifPayload);
  const io = app && app.get ? app.get('io') : null;
  if (io) {
    const payload = {
      id: notif.id,
      title: notifPayload.title,
      message: notifPayload.message,
      type: notifPayload.type,
      link: notifPayload.link,
      target_roles: targetRoles,
      created_at: notif.created_at
    };
    userIds.forEach(uid => {
      io.to(`user_${uid}`).emit('notification', payload);
    });
  }
  return notif;
}

module.exports = {
  getConcernedUserIds,
  getCircuitContextFromRef,
  notifyCircuitStep
};

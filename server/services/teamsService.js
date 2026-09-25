/**
 * Service métier Microsoft Teams (réunions locales + Graph).
 */
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const TeamsAccount = require('../models/TeamsAccount');
const TeamsMeeting = require('../models/TeamsMeeting');
const TeamsMeetingParticipant = require('../models/TeamsMeetingParticipant');
const { getMicrosoftConfig } = require('../config/microsoft');
const graph = require('./microsoftGraphService');

function signOAuthState(userId) {
  return jwt.sign(
    { purpose: 'teams_oauth', userId },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
}

function verifyOAuthState(state) {
  const decoded = jwt.verify(state, process.env.JWT_SECRET);
  if (decoded.purpose !== 'teams_oauth' || !decoded.userId) {
    throw new Error('Invalid OAuth state');
  }
  return decoded.userId;
}

function formatMeeting(row, participants = []) {
  const j = typeof row.toJSON === 'function' ? row.toJSON() : row;
  return {
    id: j.id,
    subject: j.subject,
    description: j.description,
    startAt: j.startAt,
    endAt: j.endAt,
    timezone: j.timezone,
    joinUrl: j.joinUrl,
    status: j.status,
    referenceType: j.referenceType,
    referenceId: j.referenceId,
    microsoftEventId: j.microsoftEventId,
    createdBy: j.createdBy,
    createdAt: j.createdAt,
    participants: participants.map((p) => {
      const pj = typeof p.toJSON === 'function' ? p.toJSON() : p;
      return {
        id: pj.id,
        email: pj.email,
        displayName: pj.displayName,
        participantType: pj.participantType,
        userId: pj.userId
      };
    })
  };
}

async function getStatus(userId) {
  const cfg = getMicrosoftConfig();
  const account = await TeamsAccount.findOne({ where: { userId } });
  return {
    configured: cfg.configured,
    connected: Boolean(account),
    account: account
      ? {
          microsoftEmail: account.microsoftEmail,
          displayName: account.displayName,
          connectedAt: account.connectedAt,
          tokenExpiresAt: account.tokenExpiresAt
        }
      : null
  };
}

async function getAuthUrl(userId) {
  const state = signOAuthState(userId);
  const url = graph.buildAuthorizeUrl(state);
  return { url };
}

async function handleOAuthCallback(code, state) {
  const userId = verifyOAuthState(state);
  const tokens = await graph.exchangeCodeForTokens(code);
  const me = await graph.graphGet(tokens.access_token, '/me');
  await graph.persistTokens(userId, tokens, me);
  const cfg = getMicrosoftConfig();
  return {
    userId,
    redirectTo: `${cfg.frontendUrl.replace(/\/$/, '')}/teams?teams=connected`
  };
}

async function disconnect(userId) {
  const account = await TeamsAccount.findOne({ where: { userId } });
  if (account) await account.destroy();
  return { success: true };
}

async function listMeetings(userId, { from, to, status } = {}) {
  const where = { createdBy: userId };
  if (status) where.status = status;
  if (from || to) {
    where.startAt = {};
    if (from) where.startAt[Op.gte] = new Date(from);
    if (to) where.startAt[Op.lte] = new Date(to);
  }
  const meetings = await TeamsMeeting.findAll({
    where,
    order: [['start_at', 'ASC']],
    limit: 100
  });
  const ids = meetings.map((m) => m.id);
  const parts =
    ids.length === 0
      ? []
      : await TeamsMeetingParticipant.findAll({
          where: { meetingId: { [Op.in]: ids } }
        });
  const byMeeting = new Map();
  for (const p of parts) {
    if (!byMeeting.has(p.meetingId)) byMeeting.set(p.meetingId, []);
    byMeeting.get(p.meetingId).push(p);
  }
  return meetings.map((m) => formatMeeting(m, byMeeting.get(m.id) || []));
}

async function getMeeting(userId, meetingId) {
  const meeting = await TeamsMeeting.findOne({
    where: { id: meetingId, createdBy: userId }
  });
  if (!meeting) {
    throw new graph.TeamsGraphError('TEAMS_MEETING_NOT_FOUND', 'Réunion introuvable.', 404);
  }
  const participants = await TeamsMeetingParticipant.findAll({
    where: { meetingId: meeting.id }
  });
  return formatMeeting(meeting, participants);
}

async function createMeeting(userId, body) {
  const subject = String(body.subject || '').trim().slice(0, 255);
  const startAt = body.startAt || body.start_at;
  const endAt = body.endAt || body.end_at;
  if (!subject) {
    throw new graph.TeamsGraphError('VALIDATION', 'Sujet requis.', 400);
  }
  if (!startAt || !endAt) {
    throw new graph.TeamsGraphError('VALIDATION', 'Dates début/fin requises.', 400);
  }
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new graph.TeamsGraphError('VALIDATION', 'Plage horaire invalide (start < end).', 400);
  }

  const timezone = body.timezone || 'Africa/Kinshasa';
  const participants = Array.isArray(body.participants) ? body.participants : [];

  // Format Graph local datetime without Z (Graph expects "floating" + timeZone)
  const toGraphLocal = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  let event = null;
  try {
    event = await graph.createCalendarMeeting(userId, {
      subject,
      description: body.description || '',
      startAt: toGraphLocal(start),
      endAt: toGraphLocal(end),
      timezone,
      participants
    });
  } catch (e) {
    // Si Microsoft non connecté / non configuré : on peut encore enregistrer localement sans joinUrl
    if (e.code === 'TEAMS_NOT_CONFIGURED' || e.code === 'TEAMS_NOT_CONNECTED') {
      throw e;
    }
    throw e;
  }

  const joinUrl =
    event?.onlineMeeting?.joinUrl ||
    event?.onlineMeetingUrl ||
    event?.joinUrl ||
    null;

  const meeting = await TeamsMeeting.create({
    createdBy: userId,
    microsoftEventId: event?.id || null,
    microsoftMeetingId: event?.onlineMeeting?.id || null,
    subject,
    description: body.description || null,
    startAt: start,
    endAt: end,
    timezone,
    joinUrl,
    referenceType: body.referenceType || body.reference_type || null,
    referenceId: body.referenceId || body.reference_id || null,
    status: 'scheduled'
  });

  const partRows = [];
  for (const p of participants) {
    const email = String(p.email || '').trim().toLowerCase();
    if (!email) continue;
    partRows.push(
      await TeamsMeetingParticipant.create({
        meetingId: meeting.id,
        userId: p.userId || p.user_id || null,
        email,
        displayName: p.displayName || p.display_name || null,
        participantType: p.type === 'optional' ? 'optional' : 'required'
      })
    );
  }

  return formatMeeting(meeting, partRows);
}

async function cancelMeeting(userId, meetingId) {
  const meeting = await TeamsMeeting.findOne({
    where: { id: meetingId, createdBy: userId }
  });
  if (!meeting) {
    throw new graph.TeamsGraphError('TEAMS_MEETING_NOT_FOUND', 'Réunion introuvable.', 404);
  }
  if (meeting.status === 'cancelled') {
    return formatMeeting(meeting);
  }
  try {
    if (meeting.microsoftEventId) {
      await graph.cancelCalendarEvent(userId, meeting.microsoftEventId);
    }
  } catch (e) {
    if (e.code !== 'TEAMS_NOT_CONNECTED' && e.code !== 'TEAMS_REAUTH_REQUIRED') {
      console.error('Teams cancel Graph error:', e.code || e.message);
    }
  }
  await meeting.update({ status: 'cancelled' });
  const participants = await TeamsMeetingParticipant.findAll({
    where: { meetingId: meeting.id }
  });
  return formatMeeting(meeting, participants);
}

module.exports = {
  getStatus,
  getAuthUrl,
  handleOAuthCallback,
  disconnect,
  listMeetings,
  getMeeting,
  createMeeting,
  cancelMeeting,
  formatMeeting
};

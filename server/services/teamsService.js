/**
 * Service métier Microsoft Teams (réunions locales + Graph).
 */
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const TeamsAccount = require('../models/TeamsAccount');
const TeamsMeeting = require('../models/TeamsMeeting');
const TeamsMeetingParticipant = require('../models/TeamsMeetingParticipant');
const TeamsMeetingDossier = require('../models/TeamsMeetingDossier');
const Connaissement = require('../models/Connaissement');
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

function formatDossierLink(row, conn = null) {
  const j = typeof row.toJSON === 'function' ? row.toJSON() : row;
  const c = conn && (typeof conn.toJSON === 'function' ? conn.toJSON() : conn);
  const bl = c?.blNumber || j.label || null;
  return {
    id: j.connaissementId,
    connaissementId: j.connaissementId,
    label: bl || j.label || `Dossier #${j.connaissementId}`,
    blNumber: bl || null,
    clientNom: c?.clientNom || null,
    vesselName: c?.vesselName || null,
    portOfLoading: c?.portOfLoading || null,
    portOfDischarge: c?.portOfDischarge || null,
    numeroDossier: c?.numeroDossier || null
  };
}

function formatMeeting(row, participants = [], dossiers = []) {
  const j = typeof row.toJSON === 'function' ? row.toJSON() : row;
  return {
    id: j.id,
    source: 'local',
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
    isOrganizer: true,
    canCancel: j.status === 'scheduled',
    organizer: null,
    responseStatus: null,
    webLink: null,
    participants: participants.map((p) => {
      const pj = typeof p.toJSON === 'function' ? p.toJSON() : p;
      return {
        id: pj.id,
        email: pj.email,
        displayName: pj.displayName,
        participantType: pj.participantType,
        userId: pj.userId
      };
    }),
    dossiers: Array.isArray(dossiers) ? dossiers : []
  };
}

async function loadDossiersForMeetings(meetingIds) {
  const byMeeting = new Map();
  if (!meetingIds.length) return byMeeting;
  let links = [];
  try {
    links = await TeamsMeetingDossier.findAll({
      where: { meetingId: { [Op.in]: meetingIds } }
    });
  } catch (e) {
    // Table pas encore migrée
    console.warn('Teams dossiers load skipped:', e.message);
    return byMeeting;
  }
  const connIds = [...new Set(links.map((l) => l.connaissementId).filter(Boolean))];
  const conns =
    connIds.length === 0
      ? []
      : await Connaissement.findAll({
          where: { id: { [Op.in]: connIds } },
          attributes: [
            'id',
            'blNumber',
            'clientNom',
            'vesselName',
            'portOfLoading',
            'portOfDischarge',
            'numeroDossier'
          ]
        });
  const connById = new Map(conns.map((c) => [c.id, c]));
  for (const link of links) {
    if (!byMeeting.has(link.meetingId)) byMeeting.set(link.meetingId, []);
    byMeeting.get(link.meetingId).push(formatDossierLink(link, connById.get(link.connaissementId)));
  }
  return byMeeting;
}

function parseDossierIds(body) {
  const raw = body?.dossiers ?? body?.dossierIds ?? body?.dossier_ids ?? [];
  if (!Array.isArray(raw)) return [];
  const ids = [];
  for (const item of raw) {
    const id =
      typeof item === 'object' && item != null
        ? item.id ?? item.connaissementId ?? item.connaissement_id ?? item.value
        : item;
    const n = parseInt(String(id), 10);
    if (Number.isFinite(n) && n > 0) ids.push(n);
  }
  return [...new Set(ids)].slice(0, 30);
}

async function attachDossiersToMeeting(meetingId, dossierIds) {
  if (!dossierIds.length) return [];
  const conns = await Connaissement.findAll({
    where: { id: { [Op.in]: dossierIds } },
    attributes: [
      'id',
      'blNumber',
      'clientNom',
      'vesselName',
      'portOfLoading',
      'portOfDischarge',
      'numeroDossier'
    ]
  });
  const found = new Map(conns.map((c) => [c.id, c]));
  const out = [];
  for (const id of dossierIds) {
    const c = found.get(id);
    if (!c) continue;
    const label = String(c.blNumber || `Dossier #${id}`).slice(0, 255);
    let row;
    try {
      const [created] = await TeamsMeetingDossier.findOrCreate({
        where: { meetingId, connaissementId: id },
        defaults: { meetingId, connaissementId: id, label }
      });
      row = created;
      if (row.label !== label) await row.update({ label });
    } catch (e) {
      console.warn('attachDossiersToMeeting:', e.message);
      continue;
    }
    out.push(formatDossierLink(row, c));
  }
  return out;
}

async function getStatus(userId) {
  const cfg = getMicrosoftConfig();
  const account = await TeamsAccount.findOne({ where: { userId } });
  const acs = require('./acsCallingService');
  return {
    configured: cfg.configured,
    connected: Boolean(account),
    tenantId: cfg.tenantId,
    scopes: cfg.scopes,
    adminConsentUrl: cfg.configured ? graph.buildAdminConsentUrl() : null,
    inAppCallingConfigured: acs.isAcsConfigured(),
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

async function getAdminConsentUrl() {
  return { url: graph.buildAdminConsentUrl() };
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

async function listMeetings(userId, { from, to, status, includeCalendar } = {}) {
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
  const dossiersByMeeting = await loadDossiersForMeetings(ids);
  const local = meetings.map((m) =>
    formatMeeting(m, byMeeting.get(m.id) || [], dossiersByMeeting.get(m.id) || [])
  );

  const wantCalendar =
    includeCalendar === undefined ||
    includeCalendar === true ||
    includeCalendar === '1' ||
    includeCalendar === 'true';

  if (!wantCalendar) return local;

  const account = await TeamsAccount.findOne({ where: { userId } });
  if (!account) return local;

  try {
    const calendar = await graph.listCalendarOnlineMeetings(userId, { from, to });
    const localMsIds = new Set(local.map((m) => m.microsoftEventId).filter(Boolean));
    const fromGraph = calendar.filter((m) => !localMsIds.has(m.microsoftEventId));
    return [...local, ...fromGraph].sort(
      (a, b) => new Date(a.startAt) - new Date(b.startAt)
    );
  } catch (e) {
    console.error('Teams calendar sync:', e.message || e);
    return local;
  }
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
  const dossiersByMeeting = await loadDossiersForMeetings([meeting.id]);
  return formatMeeting(
    meeting,
    participants,
    dossiersByMeeting.get(meeting.id) || []
  );
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
  const dossierIds = parseDossierIds(body);

  let dossierNote = '';
  if (dossierIds.length) {
    const preview = await Connaissement.findAll({
      where: { id: { [Op.in]: dossierIds } },
      attributes: ['id', 'blNumber']
    });
    const labels = preview.map((c) => c.blNumber || `#${c.id}`);
    if (labels.length) {
      dossierNote = `\n\nDossiers liés (ASM-PADS):\n- ${labels.join('\n- ')}`;
    }
  }

  const baseDescription = String(body.description || '');
  const descriptionForGraph = `${baseDescription}${dossierNote}`.trim();

  const toGraphLocal = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  let event = null;
  try {
    event = await graph.createCalendarMeeting(userId, {
      subject,
      description: descriptionForGraph,
      startAt: toGraphLocal(start),
      endAt: toGraphLocal(end),
      timezone,
      participants
    });
  } catch (e) {
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
    description: baseDescription || null,
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

  const dossiers = await attachDossiersToMeeting(meeting.id, dossierIds);
  return formatMeeting(meeting, partRows, dossiers);
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
  const dossiersByMeeting = await loadDossiersForMeetings([meeting.id]);
  return formatMeeting(
    meeting,
    participants,
    dossiersByMeeting.get(meeting.id) || []
  );
}

async function listMeetingDossiers(userId, meetingId) {
  const meeting = await TeamsMeeting.findOne({
    where: { id: meetingId, createdBy: userId }
  });
  if (!meeting) {
    throw new graph.TeamsGraphError('TEAMS_MEETING_NOT_FOUND', 'Réunion introuvable.', 404);
  }
  const dossiersByMeeting = await loadDossiersForMeetings([meeting.id]);
  return dossiersByMeeting.get(meeting.id) || [];
}

async function addMeetingDossiers(userId, meetingId, body) {
  const meeting = await TeamsMeeting.findOne({
    where: { id: meetingId, createdBy: userId }
  });
  if (!meeting) {
    throw new graph.TeamsGraphError('TEAMS_MEETING_NOT_FOUND', 'Réunion introuvable.', 404);
  }
  const ids = parseDossierIds(body);
  if (!ids.length) {
    throw new graph.TeamsGraphError('VALIDATION', 'Aucun dossier valide.', 400);
  }
  await attachDossiersToMeeting(meeting.id, ids);
  return listMeetingDossiers(userId, meetingId);
}

async function searchDossiers(q, { limit = 20 } = {}) {
  const term = String(q || '').trim();
  const lim = Math.min(50, Math.max(1, parseInt(String(limit), 10) || 20));
  const where = {};
  if (term) {
    const like = `%${term.replace(/[%_]/g, '')}%`;
    where[Op.or] = [
      { blNumber: { [Op.like]: like } },
      { numeroDossier: { [Op.like]: like } },
      { clientNom: { [Op.like]: like } },
      { vesselName: { [Op.like]: like } },
      { consigneeName: { [Op.like]: like } },
      { shipperName: { [Op.like]: like } }
    ];
    const asId = parseInt(term, 10);
    if (Number.isFinite(asId) && asId > 0) {
      where[Op.or].push({ id: asId });
    }
  }
  const rows = await Connaissement.findAll({
    where,
    attributes: [
      'id',
      'blNumber',
      'clientNom',
      'vesselName',
      'voyageNumber',
      'portOfLoading',
      'portOfDischarge',
      'numeroDossier',
      'carrier'
    ],
    order: [['updated_at', 'DESC']],
    limit: lim
  });
  return rows.map((r) => {
    const j = r.toJSON();
    return {
      id: j.id,
      blNumber: j.blNumber,
      label: j.blNumber,
      clientNom: j.clientNom,
      vesselName: j.vesselName,
      voyageNumber: j.voyageNumber,
      portOfLoading: j.portOfLoading,
      portOfDischarge: j.portOfDischarge,
      numeroDossier: j.numeroDossier,
      carrier: j.carrier
    };
  });
}

async function getDossierSummary(connaissementId) {
  const id = parseInt(String(connaissementId), 10);
  if (!Number.isFinite(id) || id < 1) {
    throw new graph.TeamsGraphError('VALIDATION', 'Identifiant dossier invalide.', 400);
  }
  const row = await Connaissement.findByPk(id, {
    attributes: [
      'id',
      'blNumber',
      'carrier',
      'clientNom',
      'shipperName',
      'consigneeName',
      'vesselName',
      'voyageNumber',
      'portOfLoading',
      'portOfDischarge',
      'placeOfDelivery',
      'eta',
      'etd',
      'numeroDossier',
      'numeroFeri',
      'numeroFxi',
      'totalWeightKg',
      'nombreColis',
      'modeTransport'
    ]
  });
  if (!row) {
    throw new graph.TeamsGraphError('DOSSIER_NOT_FOUND', 'Dossier introuvable.', 404);
  }
  const j = row.toJSON();
  return {
    id: j.id,
    blNumber: j.blNumber,
    label: j.blNumber,
    carrier: j.carrier,
    clientNom: j.clientNom,
    shipperName: j.shipperName,
    consigneeName: j.consigneeName,
    vesselName: j.vesselName,
    voyageNumber: j.voyageNumber,
    portOfLoading: j.portOfLoading,
    portOfDischarge: j.portOfDischarge,
    placeOfDelivery: j.placeOfDelivery,
    eta: j.eta,
    etd: j.etd,
    numeroDossier: j.numeroDossier,
    numeroFeri: j.numeroFeri,
    numeroFxi: j.numeroFxi,
    totalWeightKg: j.totalWeightKg,
    nombreColis: j.nombreColis,
    modeTransport: j.modeTransport
  };
}

module.exports = {
  getStatus,
  getAuthUrl,
  getAdminConsentUrl,
  handleOAuthCallback,
  disconnect,
  listMeetings,
  getMeeting,
  createMeeting,
  cancelMeeting,
  listMeetingDossiers,
  addMeetingDossiers,
  searchDossiers,
  getDossierSummary,
  formatMeeting
};

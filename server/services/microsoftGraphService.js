/**
 * Client Microsoft Graph + OAuth token exchange.
 */
const axios = require('axios');
const { getMicrosoftConfig } = require('../config/microsoft');
const { encryptSecret, decryptSecret } = require('./microsoftTokenService');
const TeamsAccount = require('../models/TeamsAccount');

class TeamsGraphError extends Error {
  constructor(code, message, status = 400, details = null) {
    super(message);
    this.name = 'TeamsGraphError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function buildAuthorizeUrl(state) {
  const cfg = getMicrosoftConfig();
  if (!cfg.configured) {
    throw new TeamsGraphError(
      'TEAMS_NOT_CONFIGURED',
      'Microsoft Teams n’est pas configuré (variables MICROSOFT_* manquantes).',
      503
    );
  }
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'code',
    redirect_uri: cfg.redirectUri,
    response_mode: 'query',
    scope: cfg.scopes.join(' '),
    state,
    prompt: 'select_account'
  });
  return `${cfg.authority}/oauth2/v2.0/authorize?${params.toString()}`;
}

/**
 * Consentement administrateur (org-wide) — à ouvrir avec un compte Global Admin / Application Admin.
 * Une approbation « utilisateur » classique ne suffit pas pour Calendars / OnlineMeetings.
 */
function buildAdminConsentUrl(state = 'teams_admin_consent') {
  const cfg = getMicrosoftConfig();
  if (!cfg.configured) {
    throw new TeamsGraphError(
      'TEAMS_NOT_CONFIGURED',
      'Microsoft Teams n’est pas configuré (variables MICROSOFT_* manquantes).',
      503
    );
  }
  const tenant = cfg.tenantId && cfg.tenantId !== 'common' ? cfg.tenantId : 'organizations';
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    state: String(state)
  });
  return `https://login.microsoftonline.com/${tenant}/adminconsent?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
  const cfg = getMicrosoftConfig();
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri: cfg.redirectUri,
    grant_type: 'authorization_code',
    scope: cfg.scopes.join(' ')
  });
  try {
    const { data } = await axios.post(`${cfg.authority}/oauth2/v2.0/token`, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 20000
    });
    return data;
  } catch (e) {
    const msg = e.response?.data?.error_description || e.message;
    throw new TeamsGraphError('TEAMS_TOKEN_EXCHANGE_FAILED', msg, 401);
  }
}

async function refreshAccessToken(refreshToken) {
  const cfg = getMicrosoftConfig();
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: cfg.scopes.join(' ')
  });
  try {
    const { data } = await axios.post(`${cfg.authority}/oauth2/v2.0/token`, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 20000
    });
    return data;
  } catch (e) {
    const msg = e.response?.data?.error_description || e.message;
    throw new TeamsGraphError('TEAMS_REFRESH_FAILED', msg, 401);
  }
}

async function graphGet(accessToken, path, extraHeaders = {}) {
  const cfg = getMicrosoftConfig();
  try {
    const { data } = await axios.get(`${cfg.graphBase}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}`, ...extraHeaders },
      timeout: 20000
    });
    return data;
  } catch (e) {
    mapGraphError(e);
  }
}

async function graphPost(accessToken, path, payload) {
  const cfg = getMicrosoftConfig();
  try {
    const { data } = await axios.post(`${cfg.graphBase}${path}`, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 25000
    });
    return data;
  } catch (e) {
    mapGraphError(e);
  }
}

async function graphDelete(accessToken, path) {
  const cfg = getMicrosoftConfig();
  try {
    await axios.delete(`${cfg.graphBase}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 20000
    });
  } catch (e) {
    if (e.response?.status === 404) return;
    mapGraphError(e);
  }
}

function mapGraphError(e) {
  const status = e.response?.status || 502;
  const code = e.response?.data?.error?.code || 'TEAMS_GRAPH_ERROR';
  const message =
    e.response?.data?.error?.message ||
    e.message ||
    'Erreur Microsoft Graph';
  if (status === 401) {
    throw new TeamsGraphError('TEAMS_UNAUTHORIZED', message, 401);
  }
  if (status === 403) {
    throw new TeamsGraphError('TEAMS_PERMISSION_REQUIRED', message, 403);
  }
  if (status === 429) {
    throw new TeamsGraphError('TEAMS_THROTTLED', message, 429, {
      retryAfter: e.response?.headers?.['retry-after']
    });
  }
  throw new TeamsGraphError(code, message, status >= 400 && status < 600 ? status : 502);
}

async function persistTokens(userId, tokenPayload, profile) {
  const msId = profile?.id || profile?.oid;
  if (!msId) {
    throw new TeamsGraphError(
      'TEAMS_PROFILE_MISSING',
      'Impossible de récupérer l’identité Microsoft (/me sans id).',
      400
    );
  }

  const expiresIn = Number(tokenPayload.expires_in || 3600);
  const expiresAt = new Date(Date.now() + expiresIn * 1000 - 60_000);
  const fields = {
    userId,
    microsoftUserId: String(msId),
    microsoftEmail: profile.mail || profile.userPrincipalName || null,
    displayName: profile.displayName || null,
    tenantId: getMicrosoftConfig().tenantId,
    accessTokenEnc: encryptSecret(tokenPayload.access_token),
    tokenExpiresAt: expiresAt,
    scopes: tokenPayload.scope || getMicrosoftConfig().scopes.join(' '),
    connectedAt: new Date()
  };
  if (tokenPayload.refresh_token) {
    fields.refreshTokenEnc = encryptSecret(tokenPayload.refresh_token);
  }

  try {
    // 1) Déjà lié à cet utilisateur local
    const byUser = await TeamsAccount.findOne({ where: { userId } });
    if (byUser) {
      if (!tokenPayload.refresh_token) delete fields.refreshTokenEnc;
      await byUser.update(fields);
      return byUser;
    }

    // 2) Compte Microsoft déjà lié à un autre user ASM → réattribuer (même personne / multi-comptes)
    const byMs = await TeamsAccount.findOne({
      where: { microsoftUserId: String(msId) }
    });
    if (byMs) {
      if (!tokenPayload.refresh_token) delete fields.refreshTokenEnc;
      await byMs.update(fields);
      return byMs;
    }

    return await TeamsAccount.create(fields);
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError' || e.name === 'SequelizeValidationError') {
      const detail = (e.errors || []).map((x) => x.message).filter(Boolean).join('; ');
      console.error('Teams persistTokens validation:', detail || e.message, e.fields || '');
      throw new TeamsGraphError(
        'TEAMS_ACCOUNT_SAVE_FAILED',
        detail ||
          'Impossible d’enregistrer le compte Microsoft (conflit ou données invalides).',
        409
      );
    }
    throw e;
  }
}

async function getValidAccessToken(userId) {
  const account = await TeamsAccount.findOne({ where: { userId } });
  if (!account) {
    throw new TeamsGraphError(
      'TEAMS_NOT_CONNECTED',
      'Connectez votre compte Microsoft Teams pour continuer.',
      401
    );
  }

  const now = Date.now();
  const expires = account.tokenExpiresAt ? new Date(account.tokenExpiresAt).getTime() : 0;
  let access = decryptSecret(account.accessTokenEnc);

  if (access && expires > now + 30_000) {
    return { accessToken: access, account };
  }

  const refresh = decryptSecret(account.refreshTokenEnc);
  if (!refresh) {
    throw new TeamsGraphError(
      'TEAMS_REAUTH_REQUIRED',
      'Session Microsoft expirée. Reconnectez Teams.',
      401
    );
  }

  const tokens = await refreshAccessToken(refresh);
  const updated = await persistTokens(userId, tokens, {
    id: account.microsoftUserId,
    mail: account.microsoftEmail,
    userPrincipalName: account.microsoftEmail,
    displayName: account.displayName
  });
  try {
    const me = await graphGet(tokens.access_token, '/me');
    await updated.update({
      microsoftEmail: me.mail || me.userPrincipalName || updated.microsoftEmail,
      displayName: me.displayName || updated.displayName
    });
  } catch {
    /* tokens déjà persistés */
  }

  return { accessToken: tokens.access_token, account: updated };
}

async function getCurrentMicrosoftUser(userId) {
  const { accessToken, account } = await getValidAccessToken(userId);
  const me = await graphGet(accessToken, '/me');
  return { me, account };
}

/**
 * Crée un événement calendrier avec réunion Teams.
 */
async function createCalendarMeeting(userId, payload) {
  const { accessToken } = await getValidAccessToken(userId);
  const attendees = (payload.participants || []).map((p) => ({
    emailAddress: {
      address: p.email,
      name: p.displayName || p.email
    },
    type: p.type === 'optional' ? 'optional' : 'required'
  }));

  const body = {
    subject: payload.subject,
    body: {
      contentType: 'HTML',
      content: payload.description || ''
    },
    start: {
      dateTime: payload.startAt,
      timeZone: payload.timezone || 'Africa/Kinshasa'
    },
    end: {
      dateTime: payload.endAt,
      timeZone: payload.timezone || 'Africa/Kinshasa'
    },
    attendees,
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness'
  };

  const event = await graphPost(accessToken, '/me/events', body);
  return event;
}

async function cancelCalendarEvent(userId, eventId) {
  if (!eventId) return;
  const { accessToken } = await getValidAccessToken(userId);
  await graphDelete(accessToken, `/me/events/${encodeURIComponent(eventId)}`);
}

/**
 * Liste les réunions Teams du calendrier Microsoft (créées + invitations reçues).
 */
async function listCalendarOnlineMeetings(userId, { from, to } = {}) {
  const { accessToken, account } = await getValidAccessToken(userId);
  const start = from ? new Date(from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const end = to
    ? new Date(to)
    : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // +60 jours

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new TeamsGraphError('VALIDATION', 'Plage calendrier invalide.', 400);
  }

  const params = new URLSearchParams({
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    $orderby: 'start/dateTime',
    $top: '100',
    $select:
      'id,subject,bodyPreview,start,end,organizer,attendees,isOnlineMeeting,onlineMeeting,onlineMeetingUrl,webLink,isCancelled,responseStatus'
  });

  const data = await graphGet(accessToken, `/me/calendarView?${params.toString()}`, {
    Prefer: 'outlook.timezone="UTC"'
  });
  const myEmail = String(account.microsoftEmail || '')
    .trim()
    .toLowerCase();

  const toIso = (dateTime) => {
    if (!dateTime) return null;
    const raw = String(dateTime).trim();
    if (/Z$|[+-]\d{2}:\d{2}$/.test(raw)) return new Date(raw).toISOString();
    // Avec Prefer UTC, Graph renvoie un datetime « floating » en UTC
    return new Date(`${raw.replace(/\.\d+$/, '')}Z`).toISOString();
  };

  const items = Array.isArray(data?.value) ? data.value : [];
  return items
    .filter((ev) => {
      if (ev.isCancelled) return false;
      const hasJoin =
        Boolean(ev.onlineMeeting?.joinUrl) ||
        Boolean(ev.onlineMeetingUrl) ||
        Boolean(ev.isOnlineMeeting);
      return hasJoin;
    })
    .map((ev) => {
      const organizerEmail = String(
        ev.organizer?.emailAddress?.address || ''
      )
        .trim()
        .toLowerCase();
      const isOrganizer = Boolean(myEmail && organizerEmail === myEmail);
      const joinUrl =
        ev.onlineMeeting?.joinUrl || ev.onlineMeetingUrl || null;
      const attendees = Array.isArray(ev.attendees) ? ev.attendees : [];
      return {
        id: `ms:${ev.id}`,
        source: 'microsoft',
        microsoftEventId: ev.id,
        subject: ev.subject || '(Sans titre)',
        description: ev.bodyPreview || '',
        startAt: toIso(ev.start?.dateTime),
        endAt: toIso(ev.end?.dateTime),
        timezone: ev.start?.timeZone || 'UTC',
        joinUrl,
        status: 'scheduled',
        isOrganizer,
        canCancel: isOrganizer,
        organizer: {
          name: ev.organizer?.emailAddress?.name || null,
          email: ev.organizer?.emailAddress?.address || null
        },
        responseStatus: ev.responseStatus?.response || null,
        participants: attendees.map((a, idx) => ({
          id: idx,
          email: a.emailAddress?.address || '',
          displayName: a.emailAddress?.name || null,
          participantType: a.type || 'required',
          userId: null
        })),
        webLink: ev.webLink || null,
        referenceType: null,
        referenceId: null,
        createdBy: null,
        createdAt: null
      };
    });
}

module.exports = {
  TeamsGraphError,
  buildAuthorizeUrl,
  buildAdminConsentUrl,
  exchangeCodeForTokens,
  persistTokens,
  getValidAccessToken,
  getCurrentMicrosoftUser,
  createCalendarMeeting,
  cancelCalendarEvent,
  listCalendarOnlineMeetings,
  graphGet
};

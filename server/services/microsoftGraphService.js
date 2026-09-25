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

async function graphGet(accessToken, path) {
  const cfg = getMicrosoftConfig();
  try {
    const { data } = await axios.get(`${cfg.graphBase}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
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
  const expiresIn = Number(tokenPayload.expires_in || 3600);
  const expiresAt = new Date(Date.now() + expiresIn * 1000 - 60_000);
  const fields = {
    microsoftUserId: profile.id,
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

  const existing = await TeamsAccount.findOne({ where: { userId } });
  if (existing) {
    // Ne pas écraser refresh si absent dans la réponse
    if (!tokenPayload.refresh_token) delete fields.refreshTokenEnc;
    await existing.update(fields);
    return existing;
  }
  return TeamsAccount.create({ userId, ...fields });
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

module.exports = {
  TeamsGraphError,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  persistTokens,
  getValidAccessToken,
  getCurrentMicrosoftUser,
  createCalendarMeeting,
  cancelCalendarEvent,
  graphGet
};

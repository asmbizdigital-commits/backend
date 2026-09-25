/**
 * Configuration Microsoft Entra ID / Graph pour Teams.
 */
function getMicrosoftConfig() {
  const clientId = process.env.MICROSOFT_CLIENT_ID || '';
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET || '';
  const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';
  const redirectUri =
    process.env.MICROSOFT_REDIRECT_URI ||
    `${process.env.API_PUBLIC_URL || process.env.BACKEND_URL || 'http://localhost:5002'}/api/teams/auth/callback`;
  const postLogoutRedirect =
    process.env.MICROSOFT_POST_LOGOUT_REDIRECT_URI ||
    process.env.FRONTEND_URL ||
    'http://localhost:3000/teams';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  const scopes = (
    process.env.MICROSOFT_GRAPH_SCOPES ||
    'openid offline_access User.Read Calendars.ReadWrite OnlineMeetings.ReadWrite'
  )
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    clientId,
    clientSecret,
    tenantId,
    redirectUri,
    postLogoutRedirect,
    frontendUrl,
    scopes,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    graphBase: 'https://graph.microsoft.com/v1.0',
    configured: Boolean(clientId && clientSecret)
  };
}

module.exports = { getMicrosoftConfig };

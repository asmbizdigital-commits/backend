/**
 * Azure Communication Services — tokens pour rejoindre une réunion Teams in-app.
 */
const { CommunicationIdentityClient } = require('@azure/communication-identity');

function getAcsConnectionString() {
  return String(process.env.ACS_CONNECTION_STRING || '').trim();
}

function isAcsConfigured() {
  return Boolean(getAcsConnectionString());
}

/**
 * Crée une identité ACS éphémère + token VoIP (join Teams meeting link).
 */
async function createCallingToken(displayName) {
  const connectionString = getAcsConnectionString();
  if (!connectionString) {
    const err = new Error(
      'Réunion in-app non configurée (ACS_CONNECTION_STRING manquant).'
    );
    err.code = 'ACS_NOT_CONFIGURED';
    err.status = 503;
    throw err;
  }

  const client = new CommunicationIdentityClient(connectionString);
  const user = await client.createUser();
  const tokenResponse = await client.getToken(user, ['voip']);

  return {
    userId: user.communicationUserId,
    token: tokenResponse.token,
    expiresOn: tokenResponse.expiresOn,
    displayName: String(displayName || 'Synaptasys').slice(0, 64)
  };
}

module.exports = {
  isAcsConfigured,
  createCallingToken
};

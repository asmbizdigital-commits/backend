const { Resend } = require('resend');

function getResendClient() {
  const apiKey = process.env.RESEND_API || process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function getFromAddress() {
  return process.env.RESEND_FROM || process.env.RESEND_FROM_EMAIL || 'Synaptasys <onboarding@resend.dev>';
}

function getLoginUrl() {
  const base = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
  return `${String(base).replace(/\/$/, '')}/login`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Envoie un email de bienvenue après création d'un utilisateur.
 * @returns {{ sent: boolean, error?: string, id?: string }}
 */
async function sendWelcomeUserEmail({ email, prenom, nom, role, motDePasse }) {
  const resend = getResendClient();
  if (!resend) {
    console.warn('[email] RESEND_API manquant — email de bienvenue non envoyé');
    return { sent: false, error: 'RESEND_API non configuré' };
  }

  if (!email) {
    return { sent: false, error: 'Email destinataire manquant' };
  }

  const fullName = [prenom, nom].filter(Boolean).join(' ').trim() || 'utilisateur';
  const loginUrl = getLoginUrl();
  const safeName = escapeHtml(fullName);
  const safeEmail = escapeHtml(email);
  const safeRole = escapeHtml(role || '—');
  const safePassword = escapeHtml(motDePasse || '');

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8" /><title>Bienvenue</title></head>
<body style="font-family: Arial, Helvetica, sans-serif; background:#f5f7fb; margin:0; padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 8px 24px rgba(15,23,42,.08);">
    <tr>
      <td style="background:#4f46e5; color:#fff; padding:24px 28px;">
        <h1 style="margin:0; font-size:22px;">Bienvenue sur Synaptasys</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:28px;">
        <p style="margin:0 0 16px; color:#0f172a; font-size:16px;">Bonjour <strong>${safeName}</strong>,</p>
        <p style="margin:0 0 16px; color:#334155; font-size:15px; line-height:1.55;">
          Votre compte utilisateur a été créé avec succès. Voici vos informations de connexion :
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; margin:0 0 20px;">
          <tr><td style="padding:14px 16px; color:#64748b; font-size:13px;">Email</td></tr>
          <tr><td style="padding:0 16px 14px; color:#0f172a; font-size:15px; font-weight:600;">${safeEmail}</td></tr>
          <tr><td style="padding:0 16px; color:#64748b; font-size:13px;">Mot de passe temporaire</td></tr>
          <tr><td style="padding:0 16px 14px; color:#0f172a; font-size:15px; font-weight:600; font-family:Consolas,Monaco,monospace;">${safePassword}</td></tr>
          <tr><td style="padding:0 16px; color:#64748b; font-size:13px;">Rôle</td></tr>
          <tr><td style="padding:0 16px 14px; color:#0f172a; font-size:15px; font-weight:600;">${safeRole}</td></tr>
        </table>
        <p style="margin:0 0 20px; color:#334155; font-size:14px; line-height:1.55;">
          Pour des raisons de sécurité, nous vous recommandons de changer votre mot de passe dès votre première connexion.
        </p>
        <a href="${escapeHtml(loginUrl)}" style="display:inline-block; background:#4f46e5; color:#fff; text-decoration:none; padding:12px 20px; border-radius:8px; font-weight:600; font-size:14px;">
          Se connecter
        </a>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px 24px; color:#94a3b8; font-size:12px; border-top:1px solid #e2e8f0;">
        Cet email a été envoyé automatiquement. Merci de ne pas y répondre.
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `Bonjour ${fullName},`,
    '',
    'Votre compte Synaptasys a été créé avec succès.',
    `Email : ${email}`,
    `Mot de passe temporaire : ${motDePasse || ''}`,
    `Rôle : ${role || '—'}`,
    '',
    `Connexion : ${loginUrl}`,
    '',
    'Nous vous recommandons de changer votre mot de passe dès la première connexion.'
  ].join('\n');

  try {
    const { data, error } = await resend.emails.send({
      from: getFromAddress(),
      to: [email],
      subject: 'Bienvenue sur Synaptasys — vos accès',
      html,
      text
    });

    if (error) {
      console.error('[email] Resend welcome error:', error);
      return { sent: false, error: error.message || String(error) };
    }

    console.log('[email] Welcome email sent to', email, 'id=', data?.id);
    return { sent: true, id: data?.id || null };
  } catch (err) {
    console.error('[email] Welcome email exception:', err);
    return { sent: false, error: err.message || 'Échec envoi email' };
  }
}

module.exports = {
  sendWelcomeUserEmail,
  getResendClient
};

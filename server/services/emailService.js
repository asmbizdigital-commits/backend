const { Resend } = require('resend');

function getResendClient() {
  const apiKey = process.env.RESEND_API || process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function getFromAddress() {
  return process.env.RESEND_FROM || process.env.RESEND_FROM_EMAIL || 'Synaptasys <support@synaptasys.com>';
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

const ASSIGNATION_BL_NOTIFY_TO = [
  'javakikso@gmail.com',
  'asmbizdigital@gmail.com'
];

/**
 * Notification d'assignation B/L (dossier attribué à un saisisseur).
 * @returns {{ sent: boolean, error?: string, id?: string }}
 */
async function sendAssignationBlNotificationEmail({
  dossiers = [],
  assigneeName,
  assigneeRole,
  priorite,
  dateLimite,
  commentaire,
  assigneParName
}) {
  const resend = getResendClient();
  if (!resend) {
    console.warn('[email] RESEND_API manquant — notification assignation non envoyée');
    return { sent: false, error: 'RESEND_API non configuré' };
  }

  const list = Array.isArray(dossiers) ? dossiers.filter(Boolean) : [];
  if (!list.length) {
    return { sent: false, error: 'Aucun dossier à notifier' };
  }

  const safeAssignee = escapeHtml(assigneeName || '—');
  const safeRole = escapeHtml(assigneeRole || 'Saisisseur');
  const safePriorite = escapeHtml(priorite || 'Normale');
  const safeAssignePar = escapeHtml(assigneParName || '—');
  const safeDateLimite = dateLimite
    ? escapeHtml(new Date(dateLimite).toLocaleDateString('fr-FR'))
    : '—';
  const safeCommentaire = commentaire && String(commentaire).trim()
    ? escapeHtml(String(commentaire).trim())
    : null;

  const dossierRowsHtml = list
    .map((d) => {
      const numDossier = escapeHtml(d.numeroDossier || d.numero_dossier || '—');
      const numBl = escapeHtml(d.blNumber || d.bl_number || '—');
      return `
        <tr>
          <td style="padding:14px 16px;border-bottom:1px solid #eef2f7;color:#0f172a;font-size:14px;font-weight:600;">${numDossier}</td>
          <td style="padding:14px 16px;border-bottom:1px solid #eef2f7;color:#334155;font-size:14px;font-family:Consolas,Monaco,monospace;">${numBl}</td>
        </tr>`;
    })
    .join('');

  const countLabel = list.length === 1 ? '1 dossier' : `${list.length} dossiers`;
  const subject =
    list.length === 1
      ? `Assignation dossier ${list[0].numeroDossier || list[0].blNumber || ''} — ${assigneeName || ''}`.trim()
      : `Assignation de ${list.length} dossiers — ${assigneeName || ''}`.trim();

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Assignation dossier</title></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.06);">
          <tr>
            <td style="padding:28px 32px 20px;border-bottom:1px solid #eef2f7;">
              <p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;font-weight:600;">Synaptasys · Exploitation</p>
              <h1 style="margin:0;font-size:22px;line-height:1.3;color:#0f172a;font-weight:700;">Nouveau dossier attribué</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#334155;">
                Un dossier vous a été attribué à <strong style="color:#0f172a;">${safeAssignee}</strong>
                <span style="color:#64748b;">(${safeRole})</span>.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8edf5;border-radius:12px;overflow:hidden;margin:0 0 20px;">
                <tr style="background:#f8fafc;">
                  <th align="left" style="padding:12px 16px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;font-weight:600;">Nº dossier</th>
                  <th align="left" style="padding:12px 16px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;font-weight:600;">Nº B/L</th>
                </tr>
                ${dossierRowsHtml}
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#94a3b8;width:40%;">Priorité</td>
                  <td style="padding:8px 0;font-size:14px;color:#0f172a;font-weight:600;">${safePriorite}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#94a3b8;">Date limite</td>
                  <td style="padding:8px 0;font-size:14px;color:#0f172a;font-weight:600;">${safeDateLimite}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#94a3b8;">Assigné par</td>
                  <td style="padding:8px 0;font-size:14px;color:#0f172a;font-weight:600;">${safeAssignePar}</td>
                </tr>
              </table>
              ${
                safeCommentaire
                  ? `<div style="margin-top:16px;padding:14px 16px;background:#f8fafc;border-radius:10px;border:1px solid #eef2f7;">
                      <p style="margin:0 0 6px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;font-weight:600;">Commentaire</p>
                      <p style="margin:0;font-size:14px;line-height:1.55;color:#334155;">${safeCommentaire}</p>
                    </div>`
                  : ''
              }
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 28px;border-top:1px solid #eef2f7;">
              <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
                Notification automatique Synaptasys · ${escapeHtml(countLabel)} assigné(s).
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textLines = [
    'Nouveau dossier attribué — Synaptasys',
    '',
    `Attribué à : ${assigneeName || '—'} (${assigneeRole || 'Saisisseur'})`,
    `Priorité : ${priorite || 'Normale'}`,
    `Date limite : ${dateLimite ? new Date(dateLimite).toLocaleDateString('fr-FR') : '—'}`,
    `Assigné par : ${assigneParName || '—'}`,
    '',
    'Dossiers :'
  ];
  list.forEach((d) => {
    textLines.push(
      `- Dossier ${d.numeroDossier || d.numero_dossier || '—'} · B/L ${d.blNumber || d.bl_number || '—'}`
    );
  });
  if (commentaire && String(commentaire).trim()) {
    textLines.push('', `Commentaire : ${String(commentaire).trim()}`);
  }

  try {
    const { data, error } = await resend.emails.send({
      from: getFromAddress(),
      to: ASSIGNATION_BL_NOTIFY_TO,
      subject,
      html,
      text: textLines.join('\n')
    });

    if (error) {
      console.error('[email] Resend assignation B/L error:', error);
      return { sent: false, error: error.message || String(error) };
    }

    console.log('[email] Assignation B/L notification sent id=', data?.id);
    return { sent: true, id: data?.id || null };
  } catch (err) {
    console.error('[email] Assignation B/L notification exception:', err);
    return { sent: false, error: err.message || 'Échec envoi email' };
  }
}

/**
 * Notification : dossier exporté / envoyé vers Sygrem (Excel en pièces jointes).
 * Destinataires : javakikso@gmail.com, asmbizdigital@gmail.com
 * @param {{ numeroDossier: string, attachments?: Array<{ fileName: string, buffer: Buffer|Uint8Array|ArrayBuffer }>, fileName?: string, excelBuffer?: Buffer }} opts
 * @returns {{ sent: boolean, error?: string, id?: string }}
 */
async function sendSygremExportNotificationEmail({
  numeroDossier,
  fileName,
  excelBuffer,
  attachments: attachmentInputs
}) {
  const resend = getResendClient();
  if (!resend) {
    console.warn('[email] RESEND_API manquant — notification export Sygrem non envoyée');
    return { sent: false, error: 'RESEND_API non configuré' };
  }

  const dossierLabel = String(numeroDossier || '').trim() || '—';
  const safeDossier = escapeHtml(dossierLabel);

  const files = [];
  if (Array.isArray(attachmentInputs) && attachmentInputs.length) {
    for (const item of attachmentInputs) {
      const name = String(item?.fileName || item?.filename || '').trim();
      const buf = item?.buffer ?? item?.content;
      if (!name || buf == null) continue;
      const content = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
      if (!content.length) continue;
      files.push({ filename: name, content });
    }
  } else if (excelBuffer && (excelBuffer.length || excelBuffer.byteLength)) {
    const attachmentName = String(fileName || '').trim() || `${dossierLabel} - cargaison.xlsx`;
    files.push({
      filename: attachmentName,
      content: Buffer.isBuffer(excelBuffer) ? excelBuffer : Buffer.from(excelBuffer)
    });
  }

  const fileListHtml = files.length
    ? files
        .map(
          (f) =>
            `<li style="margin:0 0 6px;font-size:14px;font-weight:600;color:#0f172a;font-family:Consolas,Monaco,monospace;">${escapeHtml(f.filename)}</li>`
        )
        .join('')
    : '<li style="margin:0;color:#64748b;">Aucun fichier</li>';

  const fileListText = files.length
    ? files.map((f) => `- ${f.filename}`).join('\n')
    : '- (aucun fichier)';

  const subject = `Dossier ${dossierLabel} envoyé vers Sygrem`;
  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Export Sygrem</title></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.06);">
          <tr>
            <td style="padding:28px 32px 20px;border-bottom:1px solid #eef2f7;">
              <p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;font-weight:600;">Synaptasys · Exploitation</p>
              <h1 style="margin:0;font-size:22px;line-height:1.3;color:#0f172a;font-weight:700;">Envoi vers Sygrem</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#334155;">
                Le dossier <strong style="color:#0f172a;">${safeDossier}</strong> a été envoyé vers Sygrem.
              </p>
              <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#64748b;">
                Fichiers Excel joints à cet email (cargaison et condition) :
              </p>
              <ul style="margin:0;padding-left:18px;">
                ${fileListHtml}
              </ul>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 28px;border-top:1px solid #eef2f7;">
              <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
                Notification automatique Synaptasys — export Excel FERI (cargaison + condition).
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    'Envoi vers Sygrem — Synaptasys',
    '',
    `Le dossier ${dossierLabel} a été envoyé vers Sygrem.`,
    'Fichiers Excel joints :',
    fileListText
  ].join('\n');

  try {
    const payload = {
      from: getFromAddress(),
      to: ASSIGNATION_BL_NOTIFY_TO,
      subject,
      html,
      text
    };
    if (files.length) payload.attachments = files;

    const { data, error } = await resend.emails.send(payload);

    if (error) {
      console.error('[email] Resend export Sygrem error:', error);
      return { sent: false, error: error.message || String(error) };
    }

    console.log('[email] Export Sygrem notification sent id=', data?.id, 'dossier=', dossierLabel, 'files=', files.length);
    return { sent: true, id: data?.id || null };
  } catch (err) {
    console.error('[email] Export Sygrem notification exception:', err);
    return { sent: false, error: err.message || 'Échec envoi email' };
  }
}

module.exports = {
  sendWelcomeUserEmail,
  sendAssignationBlNotificationEmail,
  sendSygremExportNotificationEmail,
  getResendClient,
  ASSIGNATION_BL_NOTIFY_TO
};

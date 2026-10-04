/**
 * Stats productivité contrôleur Sygrem pour fiche KPI.
 */
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CONTROLEUR_ROLES = ['Verificateur Sygrem', 'Controlleur Sygram', 'Contrôleur Sygram'];

async function listControleurs() {
  const rows = await sequelize.query(
    `
    SELECT
      u.id,
      u.prenom,
      u.nom,
      u.email,
      u.role,
      u.bureau_international_id,
      b.nom AS bureau_nom,
      b.code AS bureau_code
    FROM tbl_utilisateurs u
    LEFT JOIN tbl_bureaux_internationaux b ON b.id = u.bureau_international_id
    WHERE u.role IN ('Verificateur Sygrem', 'Controlleur Sygram', 'Contrôleur Sygram')
      AND (u.actif = 1 OR u.actif IS NULL)
    ORDER BY u.nom ASC, u.prenom ASC
    `,
    { type: QueryTypes.SELECT }
  );
  return (rows || []).map((u) => ({
    id: u.id,
    prenom: u.prenom,
    nom: u.nom,
    email: u.email,
    role: u.role,
    displayName: `${u.prenom || ''} ${u.nom || ''}`.trim() || u.email || `#${u.id}`,
    bureauId: u.bureau_international_id || null,
    bureauLabel: u.bureau_nom
      ? `${u.bureau_nom}${u.bureau_code ? ` (${u.bureau_code})` : ''}`
      : '—'
  }));
}

/**
 * @param {{ userId: number, dateFrom: string, dateTo: string }} opts
 */
async function getControleurProductivityStats(opts) {
  const userId = parseInt(String(opts.userId), 10);
  if (!userId) {
    const err = new Error('user_id requis');
    err.status = 400;
    throw err;
  }
  const dateFrom = String(opts.dateFrom || '').slice(0, 10);
  const dateTo = String(opts.dateTo || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    const err = new Error('date_from et date_to requis (YYYY-MM-DD)');
    err.status = 400;
    throw err;
  }

  const fromTs = `${dateFrom} 00:00:00`;
  const toExclusive = new Date(`${dateTo}T00:00:00`);
  toExclusive.setDate(toExclusive.getDate() + 1);
  const toTs = `${toExclusive.toISOString().slice(0, 10)} 00:00:00`;

  const [user] = await sequelize.query(
    `
    SELECT u.id, u.prenom, u.nom, u.email, u.role, u.bureau_international_id,
           b.nom AS bureau_nom, b.code AS bureau_code
    FROM tbl_utilisateurs u
    LEFT JOIN tbl_bureaux_internationaux b ON b.id = u.bureau_international_id
    WHERE u.id = :userId
    LIMIT 1
    `,
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  if (!user) {
    const err = new Error('Contrôleur introuvable');
    err.status = 404;
    throw err;
  }

  // Contrôles achevés : assignations Terminée (updated_at) + activity log checklist/validation
  const byDayAssign = await sequelize.query(
    `
    SELECT DATE(a.updated_at) AS jour, COUNT(*) AS n
    FROM tbl_assignation_bl_controleur a
    WHERE a.assignee_id = :userId
      AND a.statut = 'Terminée'
      AND a.updated_at >= :fromTs
      AND a.updated_at < :toTs
    GROUP BY DATE(a.updated_at)
    ORDER BY jour ASC
    `,
    { replacements: { userId, fromTs, toTs }, type: QueryTypes.SELECT }
  );

  let byDayLog = [];
  try {
    byDayLog = await sequelize.query(
      `
      SELECT DATE(l.created_at) AS jour, COUNT(*) AS n
      FROM tbl_dossier_activity_log l
      WHERE (l.actor_id = :userId OR l.assignee_id = :userId)
        AND l.action_type IN ('checklist_controleur', 'controle_validation')
        AND l.created_at >= :fromTs
        AND l.created_at < :toTs
      GROUP BY DATE(l.created_at)
      ORDER BY jour ASC
      `,
      { replacements: { userId, fromTs, toTs }, type: QueryTypes.SELECT }
    );
  } catch (e) {
    console.warn('[controleurKpi] activity log indisponible:', e.message);
  }

  const dayMap = new Map();
  for (const r of byDayAssign || []) {
    const key = String(r.jour).slice(0, 10);
    dayMap.set(key, Math.max(dayMap.get(key) || 0, Number(r.n) || 0));
  }
  for (const r of byDayLog || []) {
    const key = String(r.jour).slice(0, 10);
    // Prefer max of sources per day (évite double-compte partiel)
    dayMap.set(key, Math.max(dayMap.get(key) || 0, Number(r.n) || 0));
  }

  const days = [...dayMap.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalCompleted = days.reduce((s, d) => s + d.count, 0);
  const workingDays = days.length;
  const avgPerDay = workingDays > 0 ? totalCompleted / workingDays : 0;
  const daysAtTarget28 = days.filter((d) => d.count >= 28).length;
  const regularitePct = workingDays > 0 ? (daysAtTarget28 / workingDays) * 100 : 0;

  const backlog = await sequelize.query(
    `
    SELECT a.statut, COUNT(*) AS n
    FROM tbl_assignation_bl_controleur a
    WHERE a.assignee_id = :userId
      AND a.statut IN ('Assignée', 'En cours', 'Terminée', 'Annulée')
      AND a.created_at >= :fromTs
      AND a.created_at < :toTs
    GROUP BY a.statut
    `,
    { replacements: { userId, fromTs, toTs }, type: QueryTypes.SELECT }
  );
  const byStatut = {};
  for (const r of backlog || []) byStatut[r.statut] = Number(r.n) || 0;

  // Total assigné sur la période (créés dans l’intervalle, hors annulées)
  const totalAssigned =
    (byStatut['Assignée'] || 0) +
    (byStatut['En cours'] || 0) +
    (byStatut['Terminée'] || 0);

  // Terminées créées dans la période (pour cohérence taux) + terminées mises à jour
  const [termineCreated] = await sequelize.query(
    `
    SELECT COUNT(*) AS n
    FROM tbl_assignation_bl_controleur a
    WHERE a.assignee_id = :userId
      AND a.statut = 'Terminée'
      AND a.created_at >= :fromTs
      AND a.created_at < :toTs
    `,
    { replacements: { userId, fromTs, toTs }, type: QueryTypes.SELECT }
  );
  const completedFromAssigned = Number(termineCreated?.n) || 0;

  // Taux de traitement = achevés (sur assignations de la période) / assignés
  // Fallback : totalCompleted / totalAssigned si utile
  const treatmentBaseCompleted = completedFromAssigned || totalCompleted;
  const treatmentRate =
    totalAssigned > 0
      ? Math.round((Math.min(treatmentBaseCompleted, totalAssigned) / totalAssigned) * 1000) / 10
      : 0;

  // SLA : % des terminaisons dont durée (created→updated) ≤ 40 min (SLA controle_validation)
  let slaPct = null;
  try {
    const [slaRow] = await sequelize.query(
      `
      SELECT
        COUNT(*) AS total,
        SUM(
          CASE
            WHEN TIMESTAMPDIFF(MINUTE, a.created_at, a.updated_at) <= 40 THEN 1
            ELSE 0
          END
        ) AS in_sla
      FROM tbl_assignation_bl_controleur a
      WHERE a.assignee_id = :userId
        AND a.statut = 'Terminée'
        AND a.updated_at >= :fromTs
        AND a.updated_at < :toTs
      `,
      { replacements: { userId, fromTs, toTs }, type: QueryTypes.SELECT }
    );
    const tot = Number(slaRow?.total) || 0;
    const inSla = Number(slaRow?.in_sla) || 0;
    slaPct = tot > 0 ? Math.round((inSla / tot) * 1000) / 10 : null;
  } catch (e) {
    console.warn('[controleurKpi] SLA indisponible:', e.message);
  }

  return {
    controleur: {
      id: user.id,
      prenom: user.prenom,
      nom: user.nom,
      email: user.email,
      role: user.role,
      displayName: `${user.prenom || ''} ${user.nom || ''}`.trim() || user.email,
      bureauId: user.bureau_international_id || null,
      bureauLabel: user.bureau_nom
        ? `${user.bureau_nom}${user.bureau_code ? ` (${user.bureau_code})` : ''}`
        : '—'
    },
    period: { dateFrom, dateTo },
    productivity: {
      totalAssigned,
      totalCompleted,
      completedFromAssigned,
      treatmentRate,
      workingDays,
      avgPerDay: Math.round(avgPerDay * 100) / 100,
      daysAtTarget28,
      regularitePct: Math.round(regularitePct * 10) / 10,
      slaPct,
      byDay: days,
      assignationsByStatut: byStatut
    }
  };
}

module.exports = {
  listControleurs,
  getControleurProductivityStats,
  CONTROLEUR_ROLES
};

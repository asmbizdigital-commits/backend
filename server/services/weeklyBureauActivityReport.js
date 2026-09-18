/**
 * Rapport d'activité hebdomadaire par bureau international
 * (même logique que docs/scripts/generer-activite-lubumbashi-periode.js)
 */
const { sequelize } = require('../config/database');

const SLA = {
  export_sygrem: 45 * 60 * 1000,
  add_declaration: 30 * 60 * 1000,
  checklist_saisisseur: 20 * 60 * 1000
};
const MIN_RATED = 10;

function pad(n) {
  return String(n).padStart(2, '0');
}

function fmtTs(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtNum(n) {
  return Number(n || 0).toLocaleString('fr-FR');
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toSqlDateTime(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Semaine type du rapport papier : samedi 00:00 → vendredi/aujourd'hui 15:00
 * (relativement à `now`).
 */
function defaultWeeklyPeriod(now = new Date()) {
  const to = new Date(now);
  to.setHours(15, 0, 0, 0);
  const day = now.getDay(); // 0=dim … 6=sam
  const daysSinceSaturday = (day + 1) % 7;
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - daysSinceSaturday);
  return { from, to };
}

function parsePeriod(dateFromRaw, dateToRaw) {
  const def = defaultWeeklyPeriod(new Date());
  let from = def.from;
  let to = def.to;
  if (dateFromRaw) {
    const d = new Date(String(dateFromRaw).includes('T') ? dateFromRaw : `${dateFromRaw}T00:00:00`);
    if (!Number.isNaN(d.getTime())) from = d;
  }
  if (dateToRaw) {
    const raw = String(dateToRaw);
    const d = new Date(raw.includes('T') ? raw : `${raw}T15:00:00`);
    if (!Number.isNaN(d.getTime())) to = d;
  }
  if (to <= from) {
    to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  }
  return {
    from,
    to,
    fromSql: toSqlDateTime(from),
    toSql: toSqlDateTime(to),
    label: `${fmtTs(from)} → ${fmtTs(to)}`
  };
}

async function loadBureau(bureauId) {
  const [rows] = await sequelize.query(
    `
    SELECT id, code, nom, ville, pays
    FROM tbl_bureaux_internationaux
    WHERE id = :bureauId
    LIMIT 1
    `,
    { replacements: { bureauId: Number(bureauId) } }
  );
  return rows[0] || null;
}

async function buildWeeklyBureauActivityReport({ bureauId, dateFrom, dateTo }) {
  const bid = Number(bureauId);
  if (!Number.isFinite(bid) || bid < 1) {
    const err = new Error('bureau_id requis');
    err.status = 400;
    throw err;
  }

  const bureau = await loadBureau(bid);
  if (!bureau) {
    const err = new Error('Bureau introuvable');
    err.status = 404;
    throw err;
  }

  const period = parsePeriod(dateFrom, dateTo);
  const repl = { bureauId: bid, from: period.fromSql, to: period.toSql };

  const [[kpis]] = await sequelize.query(
    `
    SELECT
      (SELECT COUNT(*) FROM connaissements
        WHERE bureau_connaissement = :bureauId
          AND created_at >= :from AND created_at < :to) AS dossiers_attribues_periode,
      (SELECT COUNT(*) FROM connaissements
        WHERE bureau_connaissement = :bureauId) AS stock_bureau,
      (SELECT COUNT(DISTINCT a.connaissement_id)
        FROM tbl_assignations_bl a
        INNER JOIN connaissements c ON c.id = a.connaissement_id
        WHERE c.bureau_connaissement = :bureauId
          AND a.created_at >= :from AND a.created_at < :to) AS assignes_saisisseurs,
      (SELECT COUNT(DISTINCT l.connaissement_id)
        FROM tbl_dossier_activity_log l
        INNER JOIN connaissements c ON c.id = l.connaissement_id
        WHERE c.bureau_connaissement = :bureauId
          AND l.action_type = 'export_sygrem'
          AND l.created_at >= :from AND l.created_at < :to) AS traites_exportes,
      (SELECT COUNT(DISTINCT l.connaissement_id)
        FROM tbl_dossier_activity_log l
        INNER JOIN connaissements c ON c.id = l.connaissement_id
        WHERE c.bureau_connaissement = :bureauId
          AND l.action_type = 'add_declaration'
          AND l.created_at >= :from AND l.created_at < :to) AS declares,
      (SELECT COUNT(DISTINCT a.connaissement_id)
        FROM tbl_assignation_bl_controleur a
        INNER JOIN connaissements c ON c.id = a.connaissement_id
        WHERE c.bureau_connaissement = :bureauId
          AND a.created_at >= :from AND a.created_at < :to) AS assignes_controleurs,
      (SELECT COUNT(DISTINCT l.connaissement_id)
        FROM tbl_dossier_activity_log l
        INNER JOIN connaissements c ON c.id = l.connaissement_id
        WHERE c.bureau_connaissement = :bureauId
          AND l.action_type = 'add_feri'
          AND l.created_at >= :from AND l.created_at < :to) AS controles_feri,
      (SELECT COUNT(DISTINCT l.connaissement_id)
        FROM tbl_dossier_activity_log l
        INNER JOIN connaissements c ON c.id = l.connaissement_id
        WHERE c.bureau_connaissement = :bureauId
          AND l.action_type IN ('checklist_controleur', 'controle_validation')
          AND l.created_at >= :from AND l.created_at < :to) AS controle_conformite,
      (SELECT COUNT(DISTINCT l.connaissement_id)
        FROM tbl_dossier_activity_log l
        INNER JOIN connaissements c ON c.id = l.connaissement_id
        WHERE c.bureau_connaissement = :bureauId
          AND l.action_type = 'checklist_controleur'
          AND l.created_at >= :from AND l.created_at < :to) AS checklist_controleur,
      (SELECT COUNT(DISTINCT l.connaissement_id)
        FROM tbl_dossier_activity_log l
        INNER JOIN connaissements c ON c.id = l.connaissement_id
        WHERE c.bureau_connaissement = :bureauId
          AND l.action_type = 'controle_validation'
          AND l.created_at >= :from AND l.created_at < :to) AS validations_controle
    `,
    { replacements: repl }
  );

  const [slaRows] = await sequelize.query(
    `
    SELECT
      u.id,
      u.prenom,
      u.nom,
      SUM(CASE WHEN l.duration_ms IS NOT NULL THEN 1 ELSE 0 END) AS actions_mesurees,
      SUM(
        CASE
          WHEN l.action_type = 'export_sygrem' AND l.duration_ms IS NOT NULL AND l.duration_ms <= :slaExport THEN 1
          WHEN l.action_type = 'add_declaration' AND l.duration_ms IS NOT NULL AND l.duration_ms <= :slaDecl THEN 1
          WHEN l.action_type = 'checklist_saisisseur' AND l.duration_ms IS NOT NULL AND l.duration_ms <= :slaCheck THEN 1
          ELSE 0
        END
      ) AS actions_dans_sla,
      COUNT(DISTINCT l.connaissement_id) AS dossiers_touches,
      COUNT(DISTINCT CASE WHEN l.action_type = 'export_sygrem' THEN l.connaissement_id END) AS dossiers_exportes,
      COUNT(DISTINCT CASE WHEN l.action_type = 'add_declaration' THEN l.connaissement_id END) AS dossiers_declares
    FROM tbl_dossier_activity_log l
    INNER JOIN connaissements c ON c.id = l.connaissement_id
    INNER JOIN tbl_utilisateurs u ON u.id = l.actor_id
    WHERE c.bureau_connaissement = :bureauId
      AND l.created_at >= :from AND l.created_at < :to
      AND l.action_type IN ('export_sygrem', 'add_declaration', 'checklist_saisisseur')
      AND u.role = 'Saisisseur'
    GROUP BY u.id, u.prenom, u.nom
    `,
    {
      replacements: {
        ...repl,
        slaExport: SLA.export_sygrem,
        slaDecl: SLA.add_declaration,
        slaCheck: SLA.checklist_saisisseur
      }
    }
  );

  const ranking = slaRows
    .map((r) => {
      const measured = Number(r.actions_mesurees) || 0;
      const inSla = Number(r.actions_dans_sla) || 0;
      const pct = measured > 0 ? Math.round((inSla / measured) * 1000) / 10 : null;
      return {
        id: r.id,
        label: `${r.prenom || ''} ${r.nom || ''}`.trim() || `#${r.id}`,
        measured,
        inSla,
        pct,
        dossiers: Number(r.dossiers_touches) || 0,
        exportes: Number(r.dossiers_exportes) || 0,
        declares: Number(r.dossiers_declares) || 0,
        eligible: measured >= MIN_RATED
      };
    })
    .filter((r) => r.measured > 0)
    .sort((a, b) => {
      const ea = a.eligible ? 1 : 0;
      const eb = b.eligible ? 1 : 0;
      if (eb !== ea) return eb - ea;
      if ((b.pct || 0) !== (a.pct || 0)) return (b.pct || 0) - (a.pct || 0);
      return b.measured - a.measured;
    });
  ranking.forEach((r, i) => {
    r.rang = i + 1;
  });

  const measuredTotal = ranking.reduce((s, r) => s + r.measured, 0);
  const inSlaTotal = ranking.reduce((s, r) => s + r.inSla, 0);
  const pctGlobal =
    measuredTotal > 0 ? Math.round((inSlaTotal / measuredTotal) * 1000) / 10 : null;

  const funnelRate = (a, b) =>
    Number(b) > 0 ? Math.round((Number(a) / Number(b)) * 1000) / 10 : null;

  const k = kpis;
  const recommendations = buildRecommendations(k, pctGlobal);

  const payload = {
    generatedAt: new Date().toISOString(),
    generatedAtLabel: fmtTs(new Date()),
    period,
    bureau,
    kpis: {
      dossiers_attribues_periode: Number(k.dossiers_attribues_periode) || 0,
      stock_bureau: Number(k.stock_bureau) || 0,
      assignes_saisisseurs: Number(k.assignes_saisisseurs) || 0,
      traites_exportes: Number(k.traites_exportes) || 0,
      declares: Number(k.declares) || 0,
      assignes_controleurs: Number(k.assignes_controleurs) || 0,
      controles_feri: Number(k.controles_feri) || 0,
      controle_conformite: Number(k.controle_conformite) || 0,
      checklist_controleur: Number(k.checklist_controleur) || 0,
      validations_controle: Number(k.validations_controle) || 0
    },
    ranking,
    pctGlobal,
    funnel: {
      export_vs_assign: funnelRate(k.traites_exportes, k.assignes_saisisseurs),
      declare_vs_export: funnelRate(k.declares, k.traites_exportes)
    },
    recommendations,
    slaRules: {
      export: '45 min',
      declaration: '30 min',
      checklist: '20 min',
      minRated: MIN_RATED
    }
  };

  payload.html = renderWeeklyReportHtml(payload);
  return payload;
}

function buildRecommendations(k, pctGlobal) {
  const recs = [];
  const assigned = Number(k.assignes_saisisseurs) || 0;
  const exported = Number(k.traites_exportes) || 0;
  const declared = Number(k.declares) || 0;
  const ctrlAssign = Number(k.assignes_controleurs) || 0;
  const feri = Number(k.controles_feri) || 0;
  const conf = Number(k.controle_conformite) || 0;

  if (assigned > 0 && exported / assigned < 0.85) {
    recs.push(
      `Accélérer l’export Sygrem : ${fmtNum(exported)} traités pour ${fmtNum(assigned)} assignés. Viser ≥ 90 % sur la prochaine semaine.`
    );
  }
  if (exported > 0 && declared / exported < 0.9) {
    recs.push(
      `Réduire le stock « exporté non déclaré » : ${fmtNum(declared)} déclarés / ${fmtNum(exported)} exportés.`
    );
  }
  if (ctrlAssign > 0 && feri / ctrlAssign < 0.15) {
    recs.push(
      `Fort écart assignation contrôle (${fmtNum(ctrlAssign)}) vs n° FERI (${fmtNum(feri)}). Renforcer le suivi des vérificateurs.`
    );
  }
  if (conf < feri) {
    recs.push(
      `Le contrôle conformité (${fmtNum(conf)}) reste inférieur aux FERI saisis (${fmtNum(feri)}). Systématiser checklist / validation.`
    );
  }
  if (pctGlobal != null && pctGlobal < 70) {
    recs.push(
      `Performance SLA saisisseurs à ${pctGlobal} %. Encadrer les agents sous le seuil (export 45 min, déclaration 30 min, checklist 20 min).`
    );
  } else if (pctGlobal != null) {
    recs.push(
      `Maintenir le niveau SLA global (${pctGlobal} %) et capitaliser sur les meilleurs profils pour le tutorat.`
    );
  }
  if (Number(k.dossiers_attribues_periode) > assigned * 1.05) {
    recs.push(
      `Des dossiers créés sur la période ne sont pas encore assignés. Boucler l’assignation le jour même.`
    );
  }
  recs.push(
    `Produire ce rapport chaque semaine (vendredi 15 h) pour piloter le funnel saisie → déclaration → contrôle.`
  );
  return recs;
}

function renderWeeklyReportHtml(data) {
  const k = data.kpis;
  const cards = [
    {
      label: 'Dossiers attribués au bureau',
      value: k.dossiers_attribues_periode,
      hint: `Créés / rattachés sur la période · Stock actuel ${fmtNum(k.stock_bureau)}`
    },
    {
      label: 'Assignés aux saisisseurs',
      value: k.assignes_saisisseurs,
      hint: 'Dossiers distincts assignés (saisie)'
    },
    {
      label: 'Traités (export Sygrem)',
      value: k.traites_exportes,
      hint: 'Export vers Sygrem enregistré'
    },
    {
      label: 'Déclarés (n° déclaration)',
      value: k.declares,
      hint: 'Ajout du numéro de déclaration'
    },
    {
      label: 'Assignés aux contrôleurs (RZ)',
      value: k.assignes_controleurs,
      hint: 'Assignation contrôleur / vérificateur'
    },
    {
      label: 'Contrôlés (n° FERI)',
      value: k.controles_feri,
      hint: 'Ajout du numéro FERI'
    },
    {
      label: 'Contrôle conformité',
      value: k.controle_conformite,
      hint: `Checklist vérif. ${fmtNum(k.checklist_controleur)} · Validation ${fmtNum(k.validations_controle)}`
    }
  ];

  const rankRows = (data.ranking || [])
    .map((r) => {
      const badge = r.eligible
        ? `<span class="pill ok">Classé</span>`
        : `<span class="pill mute">&lt; ${data.slaRules.minRated} actions</span>`;
      return `<tr>
          <td class="rank">${r.rang}</td>
          <td>${esc(r.label)}</td>
          <td class="num">${r.pct != null ? `${r.pct} %` : '—'}</td>
          <td class="num">${fmtNum(r.inSla)} / ${fmtNum(r.measured)}</td>
          <td class="num">${fmtNum(r.dossiers)}</td>
          <td class="num">${fmtNum(r.exportes)}</td>
          <td class="num">${fmtNum(r.declares)}</td>
          <td>${badge}</td>
        </tr>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Activité ${esc(data.bureau.nom)}</title>
<style>
  :root {
    --ink: #0f172a;
    --muted: #64748b;
    --line: #e2e8f0;
    --bg: #f8fafc;
    --card: #ffffff;
    --accent: #0d9488;
    --accent-soft: #ccfbf1;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: var(--ink);
    background: #fff;
    font-size: 11.5px;
    line-height: 1.45;
  }
  .page { max-width: 820px; margin: 0 auto; padding: 8px 4px 24px; }
  .hero {
    background: linear-gradient(135deg, #0f766e 0%, #115e59 55%, #0f172a 100%);
    color: #fff;
    border-radius: 18px;
    padding: 28px 28px 24px;
    margin-bottom: 22px;
  }
  .hero .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 10px;
    opacity: 0.75;
    margin-bottom: 10px;
  }
  .hero h1 {
    margin: 0 0 8px;
    font-size: 24px;
    font-weight: 650;
    letter-spacing: -0.02em;
  }
  .hero p { margin: 0; opacity: 0.9; font-size: 12.5px; max-width: 36em; }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 18px;
    margin-top: 18px;
    font-size: 11px;
    opacity: 0.88;
  }
  .meta span {
    background: rgba(255,255,255,0.12);
    padding: 6px 10px;
    border-radius: 999px;
  }
  h2 { font-size: 15px; margin: 26px 0 12px; letter-spacing: -0.01em; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 16px 16px 14px;
  }
  .card .label {
    color: var(--muted);
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 8px;
  }
  .card .value {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.03em;
  }
  .card .hint { margin-top: 6px; color: var(--muted); font-size: 10.5px; }
  .note {
    background: var(--accent-soft);
    border: 1px solid #99f6e4;
    color: #115e59;
    border-radius: 12px;
    padding: 12px 14px;
    font-size: 11px;
    margin: 14px 0 8px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 14px;
    overflow: hidden;
  }
  th, td {
    padding: 9px 10px;
    text-align: left;
    border-bottom: 1px solid var(--line);
    font-size: 11px;
  }
  th {
    background: #f1f5f9;
    color: var(--muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 9.5px;
  }
  tr:last-child td { border-bottom: none; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.rank { font-weight: 700; color: var(--accent); width: 36px; }
  .pill {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 9.5px;
    font-weight: 600;
  }
  .pill.ok { background: #d1fae5; color: #065f46; }
  .pill.mute { background: #f1f5f9; color: #64748b; }
  ol.recs { margin: 0; padding: 0; list-style: none; counter-reset: rec; }
  ol.recs li {
    counter-increment: rec;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 12px 14px 12px 44px;
    position: relative;
    margin-bottom: 8px;
  }
  ol.recs li::before {
    content: counter(rec);
    position: absolute;
    left: 12px;
    top: 12px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    line-height: 22px;
    text-align: center;
  }
  .foot {
    margin-top: 28px;
    padding-top: 14px;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 10px;
  }
  .method { color: var(--muted); font-size: 10.5px; }
</style>
</head>
<body>
  <div class="page" id="weekly-report-root">
    <header class="hero">
      <div class="eyebrow">Synaptasys · ASM-PADS</div>
      <h1>Activité — ${esc(data.bureau.nom)}</h1>
      <p>Indicateurs opérationnels du circuit dossiers (saisie → déclaration → contrôle), rapport hebdomadaire.</p>
      <div class="meta">
        <span>${esc(data.bureau.nom)} · ${esc(data.bureau.code || '')}</span>
        <span>Période ${esc(data.period.label)}</span>
        <span>Extraction ${esc(data.generatedAtLabel)}</span>
      </div>
    </header>

    <h2>Indicateurs clés</h2>
    <div class="grid">
      ${cards
        .map(
          (c) => `<div class="card">
        <div class="label">${esc(c.label)}</div>
        <div class="value">${fmtNum(c.value)}</div>
        <div class="hint">${esc(c.hint)}</div>
      </div>`
        )
        .join('\n')}
    </div>

    <div class="note">
      Lecture funnel : sur <strong>${fmtNum(k.assignes_saisisseurs)}</strong> dossiers assignés aux saisisseurs,
      <strong>${fmtNum(k.traites_exportes)}</strong> exportés (${data.funnel.export_vs_assign ?? '—'} %),
      <strong>${fmtNum(k.declares)}</strong> déclarés (${data.funnel.declare_vs_export ?? '—'} % des exportés).
      Côté contrôle : <strong>${fmtNum(k.assignes_controleurs)}</strong> assignés ·
      <strong>${fmtNum(k.controles_feri)}</strong> n° FERI ·
      <strong>${fmtNum(k.controle_conformite)}</strong> conformité.
    </div>

    <h2>Classement saisisseurs — performance SLA</h2>
    <p class="method">
      % SLA = actions dans les délais ÷ actions chronométrées
      (export ≤ ${esc(data.slaRules.export)}, déclaration ≤ ${esc(data.slaRules.declaration)}, checklist ≤ ${esc(data.slaRules.checklist)}).
      Seuil classement : ≥ ${data.slaRules.minRated} actions mesurées.
      SLA global : <strong>${data.pctGlobal != null ? `${data.pctGlobal} %` : '—'}</strong>.
    </p>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Agent</th>
          <th class="num">% SLA</th>
          <th class="num">Dans délais / mesurées</th>
          <th class="num">Dossiers</th>
          <th class="num">Exportés</th>
          <th class="num">Déclarés</th>
          <th>Statut</th>
        </tr>
      </thead>
      <tbody>
        ${rankRows || '<tr><td colspan="8">Aucune activité saisisseur mesurée sur la période.</td></tr>'}
      </tbody>
    </table>

    <h2>Recommandations</h2>
    <ol class="recs">
      ${(data.recommendations || []).map((r) => `<li>${esc(r)}</li>`).join('\n')}
    </ol>

    <div class="foot">
      Rapport d’activité Synaptasys — ${esc(data.bureau.nom)} — période ${esc(data.period.label)}.
      Document destiné au pilotage opérationnel ASM-PADS.
    </div>
  </div>
</body>
</html>`;
}

module.exports = {
  buildWeeklyBureauActivityReport,
  defaultWeeklyPeriod,
  parsePeriod,
  renderWeeklyReportHtml
};

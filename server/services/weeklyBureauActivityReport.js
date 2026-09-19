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
      return `<div class="rank-row avoid-break">
          <div class="rank-num">${r.rang}</div>
          <div class="rank-main">
            <div class="rank-name">${esc(r.label)}</div>
            <div class="rank-meta">${fmtNum(r.dossiers)} dossiers · ${fmtNum(r.exportes)} exp. · ${fmtNum(r.declares)} décl.</div>
          </div>
          <div class="rank-sla">
            <div class="rank-pct">${r.pct != null ? `${r.pct} %` : '—'}</div>
            <div class="rank-frac">${fmtNum(r.inSla)}/${fmtNum(r.measured)}</div>
          </div>
          <div class="rank-status">${badge}</div>
        </div>`;
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
    font-size: 10.5px;
    line-height: 1.35;
  }
  .page { max-width: 760px; margin: 0 auto; padding: 4px 2px 12px; }
  .hero {
    background: linear-gradient(135deg, #0f766e 0%, #115e59 55%, #0f172a 100%);
    color: #fff;
    border-radius: 12px;
    padding: 14px 16px 12px;
    margin-bottom: 12px;
  }
  .hero .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 9px;
    opacity: 0.75;
    margin-bottom: 4px;
  }
  .hero h1 {
    margin: 0 0 4px;
    font-size: 18px;
    font-weight: 650;
    letter-spacing: -0.02em;
  }
  .hero p { margin: 0; opacity: 0.9; font-size: 11px; max-width: 40em; }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 8px;
    margin-top: 10px;
    font-size: 9.5px;
    opacity: 0.9;
  }
  .meta span {
    background: rgba(255,255,255,0.12);
    padding: 3px 8px;
    border-radius: 999px;
  }
  h2 {
    font-size: 12.5px;
    margin: 12px 0 6px;
    letter-spacing: -0.01em;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }
  .card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 8px 10px;
  }
  .card .label {
    color: var(--muted);
    font-size: 8.5px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 3px;
  }
  .card .value {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1.1;
  }
  .card .hint { margin-top: 2px; color: var(--muted); font-size: 9px; }
  .note {
    background: var(--accent-soft);
    border: 1px solid #99f6e4;
    color: #115e59;
    border-radius: 10px;
    padding: 8px 10px;
    font-size: 10px;
    margin: 8px 0 4px;
  }
  .method {
    color: var(--muted);
    font-size: 9.5px;
    margin: 0 0 6px;
  }
  .rank-list {
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: visible;
    background: #fff;
  }
  .rank-head, .rank-row {
    display: grid;
    grid-template-columns: 28px 1fr 72px 64px;
    gap: 6px;
    align-items: center;
    padding: 6px 8px;
  }
  .rank-head {
    background: #f1f5f9;
    color: var(--muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 8.5px;
    border-bottom: 1px solid var(--line);
  }
  .rank-row {
    border-bottom: 1px solid var(--line);
    min-height: 34px;
  }
  .rank-row:last-child { border-bottom: none; }
  .rank-num {
    font-weight: 700;
    color: var(--accent);
    font-size: 12px;
  }
  .rank-name {
    font-weight: 600;
    font-size: 11px;
    color: var(--ink);
    line-height: 1.2;
    word-break: break-word;
  }
  .rank-meta {
    color: var(--muted);
    font-size: 8.5px;
    margin-top: 1px;
  }
  .rank-sla { text-align: right; }
  .rank-pct {
    font-weight: 700;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .rank-frac {
    color: var(--muted);
    font-size: 8.5px;
    font-variant-numeric: tabular-nums;
  }
  .rank-status { text-align: right; }
  .pill {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 999px;
    font-size: 8.5px;
    font-weight: 600;
    white-space: nowrap;
  }
  .pill.ok { background: #d1fae5; color: #065f46; }
  .pill.mute { background: #f1f5f9; color: #64748b; }
  ol.recs { margin: 0; padding: 0; list-style: none; counter-reset: rec; }
  ol.recs li {
    counter-increment: rec;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 8px 10px 8px 36px;
    position: relative;
    margin-bottom: 5px;
    font-size: 10px;
  }
  ol.recs li::before {
    content: counter(rec);
    position: absolute;
    left: 8px;
    top: 7px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    line-height: 18px;
    text-align: center;
  }
  .foot {
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 9px;
  }
  .avoid-break,
  .card,
  .note,
  .hero,
  .rank-row,
  ol.recs li {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }
  h2, .rank-head {
    page-break-after: avoid;
    break-after: avoid;
  }
</style>
</head>
<body>
  <div class="page" id="weekly-report-root">
    <header class="hero avoid-break">
      <div class="eyebrow">Synaptasys · ASM-PADS</div>
      <h1>Activité — ${esc(data.bureau.nom)}</h1>
      <p>Indicateurs opérationnels du circuit dossiers (saisie → déclaration → contrôle).</p>
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
          (c) => `<div class="card avoid-break">
        <div class="label">${esc(c.label)}</div>
        <div class="value">${fmtNum(c.value)}</div>
        <div class="hint">${esc(c.hint)}</div>
      </div>`
        )
        .join('\n')}
    </div>

    <div class="note avoid-break">
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
      Seuil : ≥ ${data.slaRules.minRated} actions. SLA global : <strong>${data.pctGlobal != null ? `${data.pctGlobal} %` : '—'}</strong>.
    </p>
    <div class="rank-list">
      <div class="rank-head avoid-break">
        <div>#</div>
        <div>Agent</div>
        <div style="text-align:right">% SLA</div>
        <div style="text-align:right">Statut</div>
      </div>
      ${rankRows || '<div class="rank-row avoid-break"><div></div><div class="rank-name">Aucune activité saisisseur mesurée.</div></div>'}
    </div>

    <h2>Recommandations</h2>
    <ol class="recs">
      ${(data.recommendations || []).map((r) => `<li class="avoid-break">${esc(r)}</li>`).join('\n')}
    </ol>

    <div class="foot avoid-break">
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

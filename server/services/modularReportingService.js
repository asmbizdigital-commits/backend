/**
 * Reporting modulaire V1 — datasets whitelist (connaissements + TaskPro) + pivot.
 * Pas de SQL libre : uniquement des plans structurés validés.
 */
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ALLOWED_AGGS = new Set(['count', 'sum', 'avg', 'min', 'max']);

/** @type {Record<string, object>} */
const DATASETS = {
  connaissements: {
    id: 'connaissements',
    label: 'Connaissements / FERI',
    description: 'Dossiers connaissements (FERI / FERE) et suivi opérationnel.',
    table: 'connaissements',
    alias: 'c',
    softDelete: null,
    dimensions: [
      { id: 'carrier', sql: 'c.carrier', label: 'Transporteur', type: 'string' },
      { id: 'client_nom', sql: 'c.client_nom', label: 'Client', type: 'string' },
      { id: 'port_of_loading', sql: 'c.port_of_loading', label: 'Port chargement', type: 'string' },
      { id: 'port_of_discharge', sql: 'c.port_of_discharge', label: 'Port déchargement', type: 'string' },
      { id: 'bureau_connaissement', sql: 'c.bureau_connaissement', label: 'Bureau', type: 'number' },
      { id: 'zone_connaissement', sql: 'c.zone_connaissement', label: 'Zone', type: 'number' },
      { id: 'mode_transport', sql: 'c.mode_transport', label: 'Mode transport', type: 'string' },
      { id: 'pays_origine', sql: 'c.pays_origine', label: 'Pays origine', type: 'string' },
      { id: 'is_declared', sql: 'c.is_declared', label: 'Déclaré', type: 'boolean' },
      { id: 'is_validated', sql: 'c.is_validated', label: 'Validé', type: 'boolean' },
      { id: 'is_exported', sql: 'c.is_exported', label: 'Exporté', type: 'boolean' },
      {
        id: 'month_created',
        sql: "DATE_FORMAT(c.created_at, '%Y-%m')",
        label: 'Mois (création)',
        type: 'string'
      },
      {
        id: 'year_created',
        sql: 'YEAR(c.created_at)',
        label: 'Année (création)',
        type: 'number'
      }
    ],
    metrics: [
      { id: 'count_id', sql: 'COUNT(c.id)', label: 'Nombre de dossiers', agg: 'count' },
      {
        id: 'sum_weight',
        sql: 'SUM(COALESCE(c.total_weight_kg, 0))',
        label: 'Poids total (kg)',
        agg: 'sum'
      },
      {
        id: 'sum_colis',
        sql: 'SUM(COALESCE(c.nombre_colis, 0))',
        label: 'Nombre de colis',
        agg: 'sum'
      }
    ],
    filters: [
      { id: 'date_from', sql: 'c.created_at', op: 'gte', type: 'date', label: 'Du' },
      { id: 'date_to', sql: 'c.created_at', op: 'lte', type: 'date', label: 'Au' },
      { id: 'bureau_id', sql: 'c.bureau_connaissement', op: 'eq', type: 'number', label: 'Bureau' },
      { id: 'carrier', sql: 'c.carrier', op: 'like', type: 'string', label: 'Transporteur' },
      { id: 'client_nom', sql: 'c.client_nom', op: 'like', type: 'string', label: 'Client' }
    ]
  },
  task_pro: {
    id: 'task_pro',
    label: 'TaskPro',
    description: 'Tâches TaskPro (kanban, priorités, assignations).',
    table: 'tbl_task_pro',
    alias: 't',
    softDelete: 't.supprime = 0',
    dimensions: [
      { id: 'type_tache', sql: 't.type_tache', label: 'Type', type: 'string' },
      { id: 'statut', sql: 't.statut', label: 'Statut', type: 'string' },
      { id: 'colonne_kanban', sql: 't.colonne_kanban', label: 'Colonne kanban', type: 'string' },
      { id: 'priorite', sql: 't.priorite', label: 'Priorité', type: 'string' },
      { id: 'projet_nom', sql: 't.projet_nom', label: 'Projet', type: 'string' },
      { id: 'assignee_id', sql: 't.assignee_id', label: 'Assigné (id)', type: 'number' },
      { id: 'createur_id', sql: 't.createur_id', label: 'Créateur (id)', type: 'number' },
      { id: 'departement_id', sql: 't.departement_id', label: 'Département', type: 'number' },
      {
        id: 'month_created',
        sql: "DATE_FORMAT(t.date_creation, '%Y-%m')",
        label: 'Mois (création)',
        type: 'string'
      },
      {
        id: 'year_created',
        sql: 'YEAR(t.date_creation)',
        label: 'Année (création)',
        type: 'number'
      }
    ],
    metrics: [
      { id: 'count_id', sql: 'COUNT(t.id)', label: 'Nombre de tâches', agg: 'count' },
      {
        id: 'avg_progression',
        sql: 'AVG(COALESCE(t.progression, 0))',
        label: 'Progression moyenne (%)',
        agg: 'avg'
      }
    ],
    filters: [
      { id: 'date_from', sql: 't.date_creation', op: 'gte', type: 'date', label: 'Du' },
      { id: 'date_to', sql: 't.date_creation', op: 'lte', type: 'date', label: 'Au' },
      { id: 'priorite', sql: 't.priorite', op: 'eq', type: 'string', label: 'Priorité' },
      { id: 'statut', sql: 't.statut', op: 'eq', type: 'string', label: 'Statut' },
      { id: 'assignee_id', sql: 't.assignee_id', op: 'eq', type: 'number', label: 'Assigné' }
    ]
  }
};

function listDatasets() {
  return Object.values(DATASETS).map((d) => ({
    id: d.id,
    label: d.label,
    description: d.description,
    dimensions: d.dimensions.map(({ id, label, type }) => ({ id, label, type })),
    metrics: d.metrics.map(({ id, label, agg }) => ({ id, label, agg })),
    filters: d.filters.map(({ id, label, type }) => ({ id, label, type }))
  }));
}

function getDataset(id) {
  return DATASETS[String(id || '')] || null;
}

function findDim(dataset, dimId) {
  return dataset.dimensions.find((d) => d.id === dimId) || null;
}

function findMetric(dataset, metricId) {
  return dataset.metrics.find((m) => m.id === metricId) || null;
}

function buildWhere(dataset, filters = {}) {
  const clauses = [];
  const replacements = {};
  if (dataset.softDelete) clauses.push(`(${dataset.softDelete})`);

  for (const fDef of dataset.filters) {
    const raw = filters[fDef.id];
    if (raw === undefined || raw === null || raw === '') continue;
    const key = `f_${fDef.id}`;
    if (fDef.op === 'gte') {
      clauses.push(`${fDef.sql} >= :${key}`);
      replacements[key] = fDef.type === 'date' ? `${String(raw).slice(0, 10)} 00:00:00` : raw;
    } else if (fDef.op === 'lte') {
      clauses.push(`${fDef.sql} <= :${key}`);
      replacements[key] = fDef.type === 'date' ? `${String(raw).slice(0, 10)} 23:59:59` : raw;
    } else if (fDef.op === 'like') {
      clauses.push(`${fDef.sql} LIKE :${key}`);
      replacements[key] = `%${String(raw).replace(/[%_]/g, '')}%`;
    } else {
      clauses.push(`${fDef.sql} = :${key}`);
      replacements[key] = fDef.type === 'number' ? Number(raw) : raw;
    }
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    replacements
  };
}

/**
 * Exécute une agrégation + construit un tableau croisé.
 * @param {{ dataset: string, rowDim?: string, colDim?: string, metric?: string, filters?: object, limit?: number }} plan
 */
async function runPivotQuery(plan = {}) {
  const dataset = getDataset(plan.dataset);
  if (!dataset) {
    const err = new Error('Dataset inconnu.');
    err.status = 400;
    err.code = 'UNKNOWN_DATASET';
    throw err;
  }

  const rowDim = plan.rowDim ? findDim(dataset, plan.rowDim) : null;
  const colDim = plan.colDim ? findDim(dataset, plan.colDim) : null;
  const metric =
    findMetric(dataset, plan.metric || 'count_id') || dataset.metrics[0];

  if (!metric || !ALLOWED_AGGS.has(metric.agg)) {
    const err = new Error('Métrique invalide.');
    err.status = 400;
    err.code = 'INVALID_METRIC';
    throw err;
  }

  if (!rowDim && !colDim) {
    const err = new Error('Choisissez au moins une dimension (lignes ou colonnes).');
    err.status = 400;
    err.code = 'MISSING_DIM';
    throw err;
  }

  const selectParts = [];
  const groupParts = [];
  if (rowDim) {
    selectParts.push(`${rowDim.sql} AS row_key`);
    groupParts.push(rowDim.sql);
  } else {
    selectParts.push(`'Total' AS row_key`);
  }
  if (colDim) {
    selectParts.push(`${colDim.sql} AS col_key`);
    groupParts.push(colDim.sql);
  } else {
    selectParts.push(`'Total' AS col_key`);
  }
  selectParts.push(`${metric.sql} AS metric_value`);

  const { whereSql, replacements } = buildWhere(dataset, plan.filters || {});
  const limit = Math.min(5000, Math.max(1, parseInt(String(plan.limit || 2000), 10) || 2000));

  const sql = `
    SELECT ${selectParts.join(', ')}
    FROM \`${dataset.table}\` AS ${dataset.alias}
    ${whereSql}
    ${groupParts.length ? `GROUP BY ${groupParts.join(', ')}` : ''}
    ORDER BY row_key ASC, col_key ASC
    LIMIT ${limit}
  `;

  const rows = await sequelize.query(sql, {
    replacements,
    type: QueryTypes.SELECT
  });

  const normalized = (rows || []).map((r) => ({
    rowKey: r.row_key == null || r.row_key === '' ? '(vide)' : String(r.row_key),
    colKey: r.col_key == null || r.col_key === '' ? '(vide)' : String(r.col_key),
    value: Number(r.metric_value) || 0
  }));

  const rowKeys = [...new Set(normalized.map((r) => r.rowKey))];
  const colKeys = [...new Set(normalized.map((r) => r.colKey))];
  const matrix = {};
  for (const rk of rowKeys) {
    matrix[rk] = {};
    for (const ck of colKeys) matrix[rk][ck] = 0;
  }
  for (const cell of normalized) {
    matrix[cell.rowKey][cell.colKey] = cell.value;
  }

  const rowTotals = {};
  const colTotals = {};
  let grandTotal = 0;
  for (const rk of rowKeys) {
    let rt = 0;
    for (const ck of colKeys) {
      const v = matrix[rk][ck] || 0;
      rt += v;
      colTotals[ck] = (colTotals[ck] || 0) + v;
    }
    rowTotals[rk] = rt;
    grandTotal += rt;
  }

  return {
    dataset: dataset.id,
    datasetLabel: dataset.label,
    rowDim: rowDim ? { id: rowDim.id, label: rowDim.label } : null,
    colDim: colDim ? { id: colDim.id, label: colDim.label } : null,
    metric: { id: metric.id, label: metric.label, agg: metric.agg },
    filters: plan.filters || {},
    flat: normalized,
    pivot: {
      rowKeys,
      colKeys,
      matrix,
      rowTotals,
      colTotals,
      grandTotal
    },
    meta: {
      rowCount: normalized.length,
      generatedAt: new Date().toISOString()
    }
  };
}

/**
 * Interprétation simple d’un prompt (sans IA externe) pour préremplir un plan.
 * Extensible plus tard avec OPENAI_API_KEY.
 */
function suggestPlanFromPrompt(prompt, datasetId) {
  const text = String(prompt || '').toLowerCase();
  const dataset = getDataset(datasetId) || getDataset('connaissements');
  const plan = {
    dataset: dataset.id,
    rowDim: dataset.dimensions[0]?.id || null,
    colDim: null,
    metric: dataset.metrics[0]?.id || 'count_id',
    filters: {}
  };

  if (text.includes('task') || text.includes('tâche') || text.includes('tache')) {
    plan.dataset = 'task_pro';
  }
  if (text.includes('bureau')) {
    const d = getDataset(plan.dataset);
    if (d?.dimensions.some((x) => x.id === 'bureau_connaissement')) {
      plan.rowDim = 'bureau_connaissement';
    }
  }
  if (text.includes('mois') || text.includes('month')) {
    plan.colDim = 'month_created';
  }
  if (text.includes('priorit')) {
    plan.dataset = 'task_pro';
    plan.rowDim = 'priorite';
  }
  if (text.includes('statut') || text.includes('kanban')) {
    plan.dataset = 'task_pro';
    plan.rowDim = text.includes('kanban') ? 'colonne_kanban' : 'statut';
  }
  if (text.includes('transporteur') || text.includes('carrier')) {
    plan.dataset = 'connaissements';
    plan.rowDim = 'carrier';
  }
  if (text.includes('poids') || text.includes('weight')) {
    plan.dataset = 'connaissements';
    plan.metric = 'sum_weight';
  }

  return plan;
}

module.exports = {
  listDatasets,
  getDataset,
  runPivotQuery,
  suggestPlanFromPrompt,
  DATASETS
};

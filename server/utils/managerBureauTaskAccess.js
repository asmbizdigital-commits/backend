const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { isManagerBureauRole } = require('./userRoles');
const { loadUserGeo } = require('./managerBureauConnaissementAccess');

/**
 * IDs des tâches liées à un dossier du bureau (assignation saisie ou contrôle).
 */
async function getManagerBureauTaskIds(bureauId) {
  const bid = Number(bureauId);
  if (!Number.isFinite(bid) || bid < 1) return [];

  const [rows] = await sequelize.query(
    `
    SELECT DISTINCT task_pro_id AS id FROM (
      SELECT a.task_pro_id
      FROM tbl_assignations_bl a
      INNER JOIN connaissements c ON c.id = a.connaissement_id
      WHERE c.bureau_connaissement = :bureauId
        AND a.task_pro_id IS NOT NULL
      UNION
      SELECT a.task_pro_id
      FROM tbl_assignation_bl_controleur a
      INNER JOIN connaissements c ON c.id = a.connaissement_id
      WHERE c.bureau_connaissement = :bureauId
        AND a.task_pro_id IS NOT NULL
    ) t
    `,
    { replacements: { bureauId: bid } }
  );

  return [...new Set((rows || []).map((r) => Number(r.id)).filter((id) => Number.isFinite(id) && id > 0))];
}

function intersectWhereIds(whereClause, ids) {
  if (!ids.length) {
    whereClause.id = { [Op.in]: [-1] };
    return { empty: true };
  }
  if (whereClause.id && whereClause.id[Op.in]) {
    const allowed = new Set(ids);
    const filtered = whereClause.id[Op.in]
      .map((id) => Number(id))
      .filter((id) => allowed.has(id));
    whereClause.id = { [Op.in]: filtered.length ? filtered : [-1] };
    return { empty: filtered.length === 0 };
  }
  if (whereClause.id != null && typeof whereClause.id !== 'object') {
    const id = Number(whereClause.id);
    if (!ids.includes(id)) {
      whereClause.id = { [Op.in]: [-1] };
      return { empty: true };
    }
    return { empty: false };
  }
  whereClause.id = { [Op.in]: ids };
  return { empty: false };
}

/**
 * Restreint le where Sequelize aux tâches liées aux dossiers du bureau du Manager Bureau.
 * @returns {Promise<{ empty: boolean }>}
 */
async function applyManagerBureauTaskScope(whereClause, req) {
  if (!isManagerBureauRole(req.user?.role)) return { empty: false };

  const userGeo = await loadUserGeo(req.user.id);
  const bureauId = Number(
    userGeo?.bureau_international_id ??
      userGeo?.bureauInternationalId ??
      req.user?.bureauInternationalId ??
      req.user?.bureau_international_id
  );

  if (!Number.isFinite(bureauId) || bureauId < 1) {
    whereClause.id = { [Op.in]: [-1] };
    return { empty: true };
  }

  const ids = await getManagerBureauTaskIds(bureauId);
  return intersectWhereIds(whereClause, ids);
}

async function assertManagerBureauCanAccessTask(req, taskId) {
  if (!isManagerBureauRole(req.user?.role)) return true;

  const userGeo = await loadUserGeo(req.user.id);
  const bureauId = Number(
    userGeo?.bureau_international_id ??
      userGeo?.bureauInternationalId ??
      req.user?.bureauInternationalId ??
      req.user?.bureau_international_id
  );
  if (!Number.isFinite(bureauId) || bureauId < 1) return false;

  const tid = Number(taskId);
  if (!Number.isFinite(tid)) return false;

  const [rows] = await sequelize.query(
    `
    SELECT 1 AS ok
    FROM (
      SELECT a.task_pro_id
      FROM tbl_assignations_bl a
      INNER JOIN connaissements c ON c.id = a.connaissement_id
      WHERE a.task_pro_id = :taskId AND c.bureau_connaissement = :bureauId
      UNION
      SELECT a.task_pro_id
      FROM tbl_assignation_bl_controleur a
      INNER JOIN connaissements c ON c.id = a.connaissement_id
      WHERE a.task_pro_id = :taskId AND c.bureau_connaissement = :bureauId
    ) t
    LIMIT 1
    `,
    { replacements: { taskId: tid, bureauId } }
  );
  return Array.isArray(rows) && rows.length > 0;
}

module.exports = {
  getManagerBureauTaskIds,
  applyManagerBureauTaskScope,
  assertManagerBureauCanAccessTask
};

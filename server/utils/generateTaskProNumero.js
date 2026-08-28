const { sequelize } = require('../config/database');
const TaskPro = require('../models/TaskPro');

/**
 * Prochain numéro TASK-YYYY-NNNN unique (max existant + 1, pas count+1).
 * Évite les collisions quand count < max(numero_tache) ou en concurrence.
 */
async function nextTaskProNumeroTache(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const prefix = `TASK-${year}-`;
  const startPos = prefix.length + 1;

  const [[row]] = await sequelize.query(
    `SELECT MAX(CAST(SUBSTRING(numero_tache, :startPos) AS UNSIGNED)) AS maxSeq
     FROM tbl_task_pro
     WHERE numero_tache LIKE :likePrefix`,
    {
      replacements: {
        startPos,
        likePrefix: `${prefix}%`
      }
    }
  );

  const next = (Number(row?.maxSeq) || 0) + 1;
  const width = Math.max(4, String(next).length);
  return `${prefix}${String(next).padStart(width, '0')}`;
}

function isDuplicateNumeroTacheError(err) {
  if (err?.name === 'SequelizeUniqueConstraintError') return true;
  if (err?.parent?.code === 'ER_DUP_ENTRY') return true;
  if (err?.original?.code === 'ER_DUP_ENTRY') return true;
  const msg = String(err?.message || err?.parent?.sqlMessage || '');
  return msg.includes('numero_tache') || msg.includes('Duplicate entry');
}

/**
 * Crée une tâche TaskPro avec numero_tache unique (retry si collision concurrente).
 */
async function createTaskProWithUniqueNumero(fields, maxAttempts = 8) {
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const numero_tache = await nextTaskProNumeroTache();
    try {
      return await TaskPro.create({ ...fields, numero_tache });
    } catch (err) {
      if (isDuplicateNumeroTacheError(err)) {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  const e = lastErr || new Error('numero_tache unique introuvable');
  e.message = 'Impossible de générer un numéro de tâche unique après plusieurs tentatives.';
  throw e;
}

module.exports = {
  nextTaskProNumeroTache,
  createTaskProWithUniqueNumero,
  isDuplicateNumeroTacheError
};

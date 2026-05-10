/**
 * Liste d’IDs entiers positifs distincts depuis le tableau client (connaissement_ids ou legacy bl_document_ids).
 */
function parsePositiveIntIds(maybeArr) {
  if (!Array.isArray(maybeArr)) return [];
  const nums = maybeArr
    .map((x) => parseInt(String(x).trim(), 10))
    .filter((n) => !Number.isNaN(n) && n > 0);
  return [...new Set(nums)];
}

module.exports = { parsePositiveIntIds };

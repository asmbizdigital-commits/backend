function normalizeRole(role) {
  if (!role) return '';
  return String(role)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Rôle contrôleur Sygram : variantes BDD (Contrôleur / Controlleur, accents).
 */
function isRoleControleurSygram(role) {
  const n = normalizeRole(role);
  if (!n.includes('sygram')) return false;
  return n.includes('controleur') || n.includes('controlleur');
}

/**
 * Rôle Directeur Opérations : accepte la variante avec/sans accent.
 */
function isRoleDirecteurOperations(role) {
  const n = normalizeRole(role);
  return n === 'directeur operations';
}

/**
 * Indique si le rôle d'un utilisateur correspond au rôle cible (égalité stricte,
 * sauf pour le contrôleur Sygram où les deux orthographes sont acceptées).
 */
function assigneeMatchesRoleCible(assigneeRole, roleCible) {
  if (!assigneeRole || !roleCible) return false;
  if (isRoleControleurSygram(roleCible) && isRoleControleurSygram(assigneeRole)) return true;
  return assigneeRole === roleCible;
}

module.exports = {
  normalizeRole,
  isRoleControleurSygram,
  isRoleDirecteurOperations,
  assigneeMatchesRoleCible
};

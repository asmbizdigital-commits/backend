/**
 * Rôle contrôleur Sygram : variantes BDD (Contrôleur / Controlleur, accents).
 */
function isRoleControleurSygram(role) {
  if (!role) return false;
  const n = String(role)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  if (!n.includes('sygram')) return false;
  return n.includes('controleur') || n.includes('controlleur');
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

module.exports = { isRoleControleurSygram, assigneeMatchesRoleCible };

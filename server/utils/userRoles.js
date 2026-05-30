const ROLE_VERIFICATEUR_SYGREM = 'Verificateur Sygrem';
const ROLE_CONTROLLEUR_SYGRAM = 'Controlleur Sygram';
const LEGACY_CONTROLEUR_ACCENT = 'Contrôleur Sygram';

function normalizeRole(role) {
  if (!role) return '';
  return String(role)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function isRoleVerificateurSygrem(role) {
  if (!role) return false;
  if (role === ROLE_VERIFICATEUR_SYGREM) return true;
  if (role === LEGACY_CONTROLEUR_ACCENT) return true;
  return normalizeRole(role) === 'verificateur sygrem';
}

function isRoleControlleurSygram(role) {
  if (!role) return false;
  if (role === ROLE_CONTROLLEUR_SYGRAM) return true;
  return normalizeRole(role) === 'controlleur sygram';
}

function isRoleExploitationControleDossiers(role) {
  return isRoleVerificateurSygrem(role) || isRoleControlleurSygram(role);
}

function isRoleDirecteurOperations(role) {
  return normalizeRole(role) === 'directeur operations';
}

function assigneeMatchesRoleCible(assigneeRole, roleCible) {
  if (!assigneeRole || !roleCible) return false;
  if (roleCible === ROLE_VERIFICATEUR_SYGREM) {
    return isRoleVerificateurSygrem(assigneeRole) || isRoleControlleurSygram(assigneeRole);
  }
  return assigneeRole === roleCible;
}

/** @deprecated */
const isRoleControleurSygram = isRoleExploitationControleDossiers;

module.exports = {
  ROLE_VERIFICATEUR_SYGREM,
  ROLE_CONTROLLEUR_SYGRAM,
  normalizeRole,
  isRoleVerificateurSygrem,
  isRoleControlleurSygram,
  isRoleExploitationControleDossiers,
  isRoleControleurSygram,
  isRoleDirecteurOperations,
  assigneeMatchesRoleCible
};

const ROLE_VERIFICATEUR_SYGREM = 'Verificateur Sygrem';
const ROLE_CONTROLLEUR_SYGRAM = 'Controlleur Sygram';
const ROLE_MANAGER_BUREAU = 'Manager Bureau';
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
  const n = normalizeRole(role);
  if (!n || n.includes('chef executif')) return false;
  if (n === 'directeur operations' || n === 'direction des operations') return true;
  if (n.includes('directeur') && n.includes('operation')) return true;
  if (n.includes('direction') && n.includes('operation') && !n.includes('provinciale')) {
    return true;
  }
  return false;
}

function isSaisisseurRole(role) {
  const n = normalizeRole(role);
  return n === 'saisisseur' || n.includes('saisisseur');
}

function isManagerBureauRole(role) {
  return String(role || '').trim() === ROLE_MANAGER_BUREAU;
}

const ROLE_RESPONSABLE_ZONE = 'Responsable Zone';

function isResponsableZoneRole(role) {
  return String(role || '').trim() === ROLE_RESPONSABLE_ZONE;
}

function isCallCenterRole(role) {
  const n = normalizeRole(role);
  return n === 'call_center' || n === 'call center';
}

function isChefExecutifOperationsRole(role) {
  const n = normalizeRole(role);
  return n === 'chef executif des operations' || n.includes('chef executif');
}

function isRoleAdministrateur(role) {
  return normalizeRole(role) === 'administrateur';
}

/** Peut assigner un dossier à un saisisseur (traitement B/L). */
function canAssignSaisisseurDossier(role) {
  if (!role) return false;
  if (isCallCenterRole(role)) return false;
  if (isSaisisseurRole(role)) return false;
  const n = normalizeRole(role);
  return (
    isRoleAdministrateur(role) ||
    n === 'patron' ||
    isManagerBureauRole(role) ||
    isResponsableZoneRole(role) ||
    isRoleDirecteurOperations(role) ||
    isChefExecutifOperationsRole(role)
  );
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
  ROLE_MANAGER_BUREAU,
  ROLE_RESPONSABLE_ZONE,
  normalizeRole,
  isRoleVerificateurSygrem,
  isRoleControlleurSygram,
  isRoleExploitationControleDossiers,
  isRoleControleurSygram,
  isRoleDirecteurOperations,
  isSaisisseurRole,
  isManagerBureauRole,
  isResponsableZoneRole,
  isCallCenterRole,
  isChefExecutifOperationsRole,
  isRoleAdministrateur,
  canAssignSaisisseurDossier,
  assigneeMatchesRoleCible
};

const { Op } = require('sequelize');
const User = require('../models/User');
const { isManagerBureauRole } = require('./userRoles');

async function loadUserGeo(userId) {
  return User.findByPk(userId, {
    attributes: ['id', 'role', 'zone', 'direction_provinciale_id', 'bureau_international_id']
  });
}

/**
 * Manager Bureau : uniquement les connaissements rattachés à son bureau international.
 * Directeur Opérations et autres rôles : pas de filtre (null).
 */
async function buildManagerBureauConnaissementWhere(user) {
  if (!user || !isManagerBureauRole(user.role)) return null;

  const bureauId = Number(user.bureau_international_id);
  if (!Number.isFinite(bureauId) || bureauId < 1) {
    return { id: { [Op.eq]: -1 } };
  }
  return { bureauConnaissement: bureauId };
}

/**
 * Vérifie l'accès Manager Bureau : bureau du dossier = bureau international de l'utilisateur.
 * Autres rôles : autorisé (Directeur Opérations voit tout).
 */
async function managerBureauCanAccessConnaissement(user, doc) {
  if (!user || !isManagerBureauRole(user.role)) return true;
  if (!doc) return false;

  const bureauId = Number(user.bureau_international_id);
  if (!Number.isFinite(bureauId) || bureauId < 1) return false;

  const docBureau = Number(
    doc.bureauConnaissement ??
    doc.bureau_connaissement ??
    null
  );
  if (!Number.isFinite(docBureau) || docBureau < 1) return false;

  return docBureau === bureauId;
}

module.exports = {
  loadUserGeo,
  buildManagerBureauConnaissementWhere,
  managerBureauCanAccessConnaissement
};

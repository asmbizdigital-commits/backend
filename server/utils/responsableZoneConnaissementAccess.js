const { Op } = require('sequelize');
const ConnexionResponsable = require('../models/ConnexionResponsable');
const { isResponsableZoneRole } = require('./userRoles');

/**
 * Charge les IDs directions / bureaux liés au Responsable Zone via tbl_connexions_responsables.
 */
async function loadResponsableZoneScope(userId) {
  const links = await ConnexionResponsable.findAll({
    where: { utilisateurId: userId },
    attributes: ['directionProvincialeId', 'bureauInternationalId']
  });

  const directionIds = [
    ...new Set(
      links
        .map((l) => l.directionProvincialeId)
        .filter((id) => id != null && Number(id) > 0)
        .map((id) => Number(id))
    )
  ];
  const bureauIds = [
    ...new Set(
      links
        .map((l) => l.bureauInternationalId)
        .filter((id) => id != null && Number(id) > 0)
        .map((id) => Number(id))
    )
  ];

  return { directionIds, bureauIds };
}

/**
 * Filtre liste connaissements : direction OU bureau parmi les connexions du Responsable Zone.
 */
async function buildResponsableZoneConnaissementWhere(user) {
  if (!user || !isResponsableZoneRole(user.role)) return null;

  const { directionIds, bureauIds } = await loadResponsableZoneScope(user.id);

  if (!directionIds.length && !bureauIds.length) {
    return { id: { [Op.eq]: -1 } };
  }

  const or = [];
  if (directionIds.length) {
    or.push({ directionConnaissement: { [Op.in]: directionIds } });
  }
  if (bureauIds.length) {
    or.push({ bureauConnaissement: { [Op.in]: bureauIds } });
  }
  return { [Op.or]: or };
}

async function responsableZoneCanAccessConnaissement(user, doc) {
  if (!user || !isResponsableZoneRole(user.role)) return true;
  if (!doc) return false;

  const { directionIds, bureauIds } = await loadResponsableZoneScope(user.id);
  if (!directionIds.length && !bureauIds.length) return false;

  const dirId = doc.directionConnaissement ?? doc.direction_connaissement ?? null;
  const burId = doc.bureauConnaissement ?? doc.bureau_connaissement ?? null;

  if (dirId != null && directionIds.includes(Number(dirId))) return true;
  if (burId != null && bureauIds.includes(Number(burId))) return true;
  return false;
}

module.exports = {
  loadResponsableZoneScope,
  buildResponsableZoneConnaissementWhere,
  responsableZoneCanAccessConnaissement
};

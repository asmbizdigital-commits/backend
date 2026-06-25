const { Op } = require('sequelize');
const Zone = require('../models/Zone');
const User = require('../models/User');
const { isManagerBureauRole } = require('./userRoles');

async function loadUserGeo(userId) {
  return User.findByPk(userId, {
    attributes: ['id', 'role', 'zone', 'direction_provinciale_id', 'bureau_international_id']
  });
}

async function resolveUserZonePk(userZoneCode) {
  if (!userZoneCode) return null;
  const zone = await Zone.findOne({ where: { code: userZoneCode } });
  return zone?.id ?? null;
}

/**
 * Filtre liste connaissements : zone + direction + bureau de l'utilisateur Manager Bureau (AND).
 */
async function buildManagerBureauConnaissementWhere(user) {
  if (!user || !isManagerBureauRole(user.role)) return null;

  const zonePk = await resolveUserZonePk(user.zone);
  const geo = {};
  if (zonePk) geo.zoneConnaissement = zonePk;
  if (user.direction_provinciale_id) geo.directionConnaissement = user.direction_provinciale_id;
  if (user.bureau_international_id) geo.bureauConnaissement = user.bureau_international_id;

  if (Object.keys(geo).length === 0) {
    return { id: { [Op.eq]: -1 } };
  }
  return geo;
}

async function managerBureauCanAccessConnaissement(user, doc) {
  if (!user || !isManagerBureauRole(user.role)) return true;
  if (!doc) return false;

  const zonePk = await resolveUserZonePk(user.zone);
  if (!zonePk && !user.direction_provinciale_id && !user.bureau_international_id) {
    return false;
  }
  if (zonePk && doc.zoneConnaissement !== zonePk) return false;
  if (user.direction_provinciale_id && doc.directionConnaissement !== user.direction_provinciale_id) {
    return false;
  }
  if (user.bureau_international_id && doc.bureauConnaissement !== user.bureau_international_id) {
    return false;
  }
  return true;
}

module.exports = {
  loadUserGeo,
  resolveUserZonePk,
  buildManagerBureauConnaissementWhere,
  managerBureauCanAccessConnaissement
};

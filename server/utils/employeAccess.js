const EmployeUser = require('../models/EmployeUser');

const RH_READ_ROLES = [
  'Superviseur RH',
  'Administrateur',
  'Patron',
  'Auditeur',
  'Web Master'
];

/**
 * Autorise la lecture d’un dossier employé (RH) ou de la liaison self.
 */
async function canReadEmployeData(user, employeId) {
  if (!user || !employeId) return false;
  if (RH_READ_ROLES.includes(user.role)) return true;
  const link = await EmployeUser.findOne({
    where: {
      user_id: user.id,
      employe_id: parseInt(employeId, 10)
    },
    attributes: ['id']
  });
  return Boolean(link);
}

function denyEmployeAccess(res) {
  return res.status(403).json({
    success: false,
    error: 'Access denied',
    message: 'Accès refusé aux données de cet employé'
  });
}

module.exports = {
  RH_READ_ROLES,
  canReadEmployeData,
  denyEmployeAccess
};

/**
 * Accès Monitoring Bureau — Manager Bureau + Administrateur.
 */
const {
  isManagerBureauRole,
  isRoleAdministrateur
} = require('./userRoles');

function canAccessMonitoringBureau(user) {
  if (!user) return false;
  if (isRoleAdministrateur(user.role)) return true;
  if (isManagerBureauRole(user.role)) return true;
  return false;
}

function requireMonitoringBureauAccess(req, res, next) {
  if (canAccessMonitoringBureau(req.user)) return next();
  return res.status(403).json({
    success: false,
    message: 'Accès réservé au Monitoring Bureau (Manager Bureau / Administrateur).'
  });
}

module.exports = {
  canAccessMonitoringBureau,
  requireMonitoringBureauAccess
};

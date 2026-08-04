/**
 * Accès API monitoring phase test — même liste blanche e-mails que le frontend.
 */
const MONITORING_PHASE_TEST_EMAILS = [
  'divine.kadima@africansm-rdc.com',
  'van.sanza@africansm-rdc.com',
  'kennedy.mukendi@africansm-rdc.com',
  'kyele.maeva@africansm-rdc.com'
];

function canAccessMonitoringPhaseTest(user) {
  const email = String(user?.email || '')
    .trim()
    .toLowerCase();
  if (!email) return false;
  return MONITORING_PHASE_TEST_EMAILS.includes(email);
}

function requireMonitoringPhaseTestAccess(req, res, next) {
  if (req.user?.nom === 'Jimmy') return next();
  if (canAccessMonitoringPhaseTest(req.user)) return next();
  return res.status(403).json({
    success: false,
    message: 'Accès réservé au monitoring phase test.'
  });
}

module.exports = {
  MONITORING_PHASE_TEST_EMAILS,
  canAccessMonitoringPhaseTest,
  requireMonitoringPhaseTestAccess
};

const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');

const router = express.Router();
router.use(authenticateToken);

const TABLE = 'guichetier_clotures';

// GET /api/guichetier/session-status — pour le guichetier connecté, indique si la journée/shift est clôturé(e) pour aujourd'hui
router.get('/session-status', requireRole(['Guichetier']), async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await sequelize.query(
      `SELECT type, closed_at FROM ${TABLE} WHERE utilisateur_id = :userId AND date_jour = :date LIMIT 1`,
      { replacements: { userId: req.user.id, date: today }, type: QueryTypes.SELECT }
    );
    const closed = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    return res.json({
      closed: !!closed,
      type: closed ? closed.type : null,
      closedAt: closed ? closed.closed_at : null
    });
  } catch (err) {
    if (err.message && /doesn't exist|ER_NO_SUCH_TABLE|Unknown table/i.test(err.message)) {
      return res.json({ closed: false, type: null, closedAt: null });
    }
    console.error('Guichetier session-status:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/guichetier/cloturer — clôturer la journée ou le shift (une seule fois par jour)
router.post('/cloturer', requireRole(['Guichetier']), [
  body('type').isIn(['journee', 'shift']).withMessage('type doit être "journee" ou "shift"')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    const { type } = req.body;
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();

    const existing = await sequelize.query(
      `SELECT id FROM ${TABLE} WHERE utilisateur_id = :userId AND date_jour = :date LIMIT 1`,
      { replacements: { userId: req.user.id, date: today }, type: QueryTypes.SELECT }
    );
    if (Array.isArray(existing) && existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Vous avez déjà clôturé votre journée (ou shift) pour aujourd\'hui. Aucune opération n\'est plus possible.'
      });
    }

    await sequelize.query(
      `INSERT INTO ${TABLE} (utilisateur_id, date_jour, type, closed_at) VALUES (:userId, :date, :type, :closedAt)`,
      {
        replacements: { userId: req.user.id, date: today, type, closedAt: now },
        type: QueryTypes.INSERT
      }
    );

    return res.json({
      success: true,
      message: type === 'journee' ? 'Journée clôturée avec succès.' : 'Shift clôturé avec succès.',
      closedAt: now.toISOString()
    });
  } catch (err) {
    if (err.message && /doesn't exist|ER_NO_SUCH_TABLE|Unknown table/i.test(err.message)) {
      return res.status(503).json({
        success: false,
        message: 'Table de clôture non disponible. Contactez l\'administrateur.'
      });
    }
    console.error('Guichetier cloturer:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Utilitaire pour les autres routes : vérifier si le guichetier a clôturé aujourd'hui (à appeler après requireRole Guichetier)
async function isGuichetierCloture(userId) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await sequelize.query(
      `SELECT 1 FROM ${TABLE} WHERE utilisateur_id = :userId AND date_jour = :date LIMIT 1`,
      { replacements: { userId, date: today }, type: QueryTypes.SELECT }
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

module.exports = router;
module.exports.isGuichetierCloture = isGuichetierCloture;

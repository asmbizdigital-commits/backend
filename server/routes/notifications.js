const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth');
const Notification = require('../models/Notification');

const router = express.Router();

// Auth for all routes
router.use(authenticateToken);

// POST /api/notifications - log a notification and optionally broadcast via Socket.io
router.post('/', [
  body('title').isLength({ min: 2 }),
  body('message').isLength({ min: 2 }),
  body('type').optional().isIn(['info','success','warning','error','urgent']),
  body('link').optional().isString(),
  body('target_roles').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const payload = {
      title: req.body.title,
      message: req.body.message,
      type: req.body.type || 'info',
      link: req.body.link || null,
      target_roles: req.body.target_roles ? JSON.stringify(req.body.target_roles) : null,
      created_by: req.user?.id || null
    };

    const notif = await Notification.create(payload);

    // Broadcast if socket server available
    if (req.app.get('io')) {
      req.app.get('io').emit('notification', {
        id: notif.id,
        title: notif.title,
        message: notif.message,
        type: notif.type,
        link: notif.link,
        target_roles: req.body.target_roles || null,
        created_at: notif.created_at
      });
    }

    res.status(201).json({ success: true, data: notif });
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// GET /api/notifications - list recent (filtrées : générales, par rôle, ou ciblées user:X)
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const all = await Notification.findAll({ order: [['created_at','DESC']], limit: limit * 3 });
    const rows = all.filter((n) => {
      if (!n.target_roles) return true; // générales
      let roles;
      try {
        roles = typeof n.target_roles === 'string' ? JSON.parse(n.target_roles) : n.target_roles;
      } catch { return false; }
      if (!Array.isArray(roles) || roles.length === 0) return true;
      if (roles.includes(req.user.role)) return true;
      if (roles.includes('user:' + req.user.id)) return true;
      return false;
    }).slice(0, limit);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error listing notifications:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

module.exports = router;



const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { authenticateToken, requireRole } = require('../middleware/auth');
const Absence = require('../models/Absence');
const { Employe, EmployeUser } = require('../models');

const ROLES_MANAGE_CONGES = ['Administrateur', 'Superviseur RH'];

// GET /api/absences - Liste des absences (filtres: employe_id, date_debut, date_fin, type_absence)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 50, employe_id, date_debut, date_fin, type_absence } = req.query;
    const offset = (page - 1) * limit;
    const where = {};
    if (employe_id) where.employe_id = employe_id;
    if (type_absence) where.type_absence = type_absence;
    if (date_debut || date_fin) {
      where.date_absence = {};
      if (date_debut) where.date_absence[Op.gte] = date_debut;
      if (date_fin) where.date_absence[Op.lte] = date_fin;
    }

    if (!ROLES_MANAGE_CONGES.includes(req.user.role)) {
      const liaison = await EmployeUser.findOne({ where: { user_id: req.user.id } });
      if (!liaison) {
        return res.json({
          success: true,
          data: [],
          pagination: { page: parseInt(page), limit: parseInt(limit), total: 0, pages: 0 }
        });
      }
      where.employe_id = liaison.employe_id;
    }

    const { count, rows } = await Absence.findAndCountAll({
      where,
      include: [
        { model: Employe, as: 'employe', attributes: ['id', 'nom_famille', 'nom_usage', 'prenoms', 'matricule'] }
      ],
      order: [['date_absence', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: count, pages: Math.ceil(count / limit) }
    });
  } catch (error) {
    console.error('Erreur récupération absences:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// POST /api/absences - Enregistrer une absence (RH / Admin)
router.post('/',
  authenticateToken,
  requireRole(ROLES_MANAGE_CONGES),
  [
    body('employe_id').isInt({ min: 1 }).withMessage('ID employé requis'),
    body('date_absence').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date invalide (AAAA-MM-JJ)'),
    body('type_absence').isIn(['justifiee', 'non_justifiee']).withMessage('Type invalide'),
    body('motif').optional().trim(),
    body('demande_conge_id').optional({ nullable: true }).isInt({ min: 1 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const arr = errors.array();
        return res.status(400).json({ success: false, message: arr[0]?.msg || 'Données invalides', errors: arr });
      }

      const employe = await Employe.findByPk(req.body.employe_id);
      if (!employe) return res.status(404).json({ success: false, message: 'Employé non trouvé' });

      const payload = {
        employe_id: req.body.employe_id,
        date_absence: req.body.date_absence,
        type_absence: req.body.type_absence,
        motif: req.body.motif || null,
        demande_conge_id: req.body.demande_conge_id || null,
        enregistre_par_id: req.user.id
      };

      const created = await Absence.create(payload);
      const withRelations = await Absence.findByPk(created.id, {
        include: [{ model: Employe, as: 'employe', attributes: ['id', 'nom_famille', 'prenoms', 'matricule'] }]
      });
      res.status(201).json({ success: true, message: 'Absence enregistrée', data: withRelations });
    } catch (error) {
      console.error('Erreur création absence:', error);
      if (error.name === 'SequelizeForeignKeyConstraintError') {
        return res.status(400).json({ success: false, message: 'Employé ou demande de congé invalide' });
      }
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

module.exports = router;

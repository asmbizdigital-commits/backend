const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const ContentieuxDossier = require('../models/ContentieuxDossier');
const Connaissement = require('../models/Connaissement');
const User = require('../models/User');
const AssignationBL = require('../models/AssignationBL');
const { authenticateToken } = require('../middleware/auth');
const {
  isRoleExploitationControleDossiers,
  isManagerBureauRole,
  isResponsableZoneRole,
  normalizeRole
} = require('../utils/userRoles');

const router = express.Router();
router.use(authenticateToken);

function canViewContentieux(user) {
  if (!user) return false;
  if (user.nom === 'Jimmy') return true;
  const role = user.role;
  const n = normalizeRole(role);
  return (
    isRoleExploitationControleDossiers(role) ||
    n === 'administrateur' ||
    isManagerBureauRole(role) ||
    isResponsableZoneRole(role) ||
    n === 'patron'
  );
}

function requireCreateContentieux(req, res, next) {
  if (req.user?.nom === 'Jimmy') return next();
  if (isRoleExploitationControleDossiers(req.user?.role)) return next();
  return res.status(403).json({
    success: false,
    message:
      'Seul un Verificateur Sygrem / Controlleur Sygram peut ajouter un dossier au contentieux.'
  });
}

function requireViewContentieux(req, res, next) {
  if (canViewContentieux(req.user)) return next();
  return res.status(403).json({
    success: false,
    message: 'Accès non autorisé au module contentieux.'
  });
}

function personName(user) {
  if (!user) return null;
  const name = `${user.prenom || ''} ${user.nom || ''}`.trim();
  return name || user.email || (user.id != null ? `#${user.id}` : null);
}

async function resolveSaisisseurFromConnaissement(connaissementId) {
  const assignation = await AssignationBL.findOne({
    where: {
      connaissementId,
      statut: { [Op.in]: ['Assignée', 'En cours', 'Terminée'] }
    },
    include: [
      {
        model: User,
        as: 'assignee',
        attributes: ['id', 'nom', 'prenom', 'email', 'role']
      }
    ],
    order: [['created_at', 'DESC']]
  });

  if (!assignation?.assignee) {
    return { saisisseurId: null, saisisseurNom: null };
  }

  return {
    saisisseurId: assignation.assignee.id,
    saisisseurNom: personName(assignation.assignee)
  };
}

router.get(
  '/',
  requireViewContentieux,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 200 }),
    query('search').optional().isString().trim(),
    query('statut').optional().isIn(['Nouveau', 'En cours', 'Clôturé', 'Annulé']),
    query('connaissement_ids').optional().isString()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (errors.isEmpty() === false) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const page = parseInt(req.query.page || '1', 10);
      const limit = parseInt(req.query.limit || '50', 10);
      const offset = (page - 1) * limit;
      const where = {};

      if (req.query.statut) {
        where.statut = req.query.statut;
      }

      if (req.query.connaissement_ids) {
        const ids = String(req.query.connaissement_ids)
          .split(',')
          .map((x) => parseInt(x.trim(), 10))
          .filter((n) => Number.isFinite(n) && n > 0);
        if (ids.length) {
          where.connaissementId = { [Op.in]: ids };
        }
      }

      if (req.query.search) {
        const q = `%${req.query.search}%`;
        where[Op.or] = [
          { numeroDossier: { [Op.like]: q } },
          { blNumber: { [Op.like]: q } },
          { saisisseurNom: { [Op.like]: q } }
        ];
      }

      const { rows, count } = await ContentieuxDossier.findAndCountAll({
        where,
        include: [
          {
            model: User,
            as: 'creePar',
            attributes: ['id', 'nom', 'prenom', 'email', 'role']
          },
          {
            model: User,
            as: 'saisisseur',
            attributes: ['id', 'nom', 'prenom', 'email', 'role'],
            required: false
          }
        ],
        order: [['created_at', 'DESC']],
        limit,
        offset
      });

      res.json({
        success: true,
        contentieux: rows,
        pagination: {
          page,
          limit,
          total: count,
          pages: Math.ceil(count / limit) || 1
        }
      });
    } catch (error) {
      console.error('List contentieux error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du chargement des contentieux.',
        details: error.message
      });
    }
  }
);

router.post(
  '/',
  requireCreateContentieux,
  [
    body('connaissement_id').isInt({ min: 1 }).withMessage('connaissement_id invalide'),
    body('commentaire').optional({ nullable: true }).isString().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const connaissementId = parseInt(req.body.connaissement_id, 10);
      const connaissement = await Connaissement.findByPk(connaissementId, {
        attributes: ['id', 'numeroDossier', 'blNumber']
      });

      if (!connaissement) {
        return res.status(404).json({
          success: false,
          message: 'Dossier introuvable.'
        });
      }

      const existing = await ContentieuxDossier.findOne({
        where: { connaissementId }
      });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: 'Ce dossier est déjà enregistré dans le contentieux.',
          contentieux: existing
        });
      }

      const numeroDossier = String(connaissement.numeroDossier || '').trim();
      if (!numeroDossier) {
        return res.status(400).json({
          success: false,
          message: 'Le numéro de dossier est manquant sur ce connaissement.'
        });
      }

      let saisisseurId =
        req.body.saisisseur_id != null ? parseInt(req.body.saisisseur_id, 10) : null;
      let saisisseurNom = String(req.body.saisisseur_nom || '').trim() || null;

      if (!saisisseurNom || !Number.isFinite(saisisseurId)) {
        const resolved = await resolveSaisisseurFromConnaissement(connaissementId);
        if (!Number.isFinite(saisisseurId)) saisisseurId = resolved.saisisseurId;
        if (!saisisseurNom) saisisseurNom = resolved.saisisseurNom;
      }

      if (Number.isFinite(saisisseurId) && !saisisseurNom) {
        const u = await User.findByPk(saisisseurId, {
          attributes: ['id', 'nom', 'prenom', 'email']
        });
        saisisseurNom = personName(u);
      }

      const created = await ContentieuxDossier.create({
        connaissementId,
        numeroDossier,
        blNumber: connaissement.blNumber || null,
        saisisseurId: Number.isFinite(saisisseurId) ? saisisseurId : null,
        saisisseurNom,
        creeParId: req.user.id,
        statut: 'Nouveau',
        commentaire: String(req.body.commentaire || '').trim() || null
      });

      const full = await ContentieuxDossier.findByPk(created.id, {
        include: [
          {
            model: User,
            as: 'creePar',
            attributes: ['id', 'nom', 'prenom', 'email', 'role']
          },
          {
            model: User,
            as: 'saisisseur',
            attributes: ['id', 'nom', 'prenom', 'email', 'role'],
            required: false
          }
        ]
      });

      const io = req.app.get('io');
      if (io) {
        io.emit('contentieux_dossiers:changed', {
          at: new Date().toISOString(),
          id: created.id,
          connaissement_id: connaissementId
        });
      }

      res.status(201).json({
        success: true,
        message: 'Dossier ajouté au contentieux.',
        contentieux: full
      });
    } catch (error) {
      console.error('Create contentieux error:', error);
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({
          success: false,
          message: 'Ce dossier est déjà enregistré dans le contentieux.'
        });
      }
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la création du contentieux.',
        details: error.message
      });
    }
  }
);

module.exports = router;

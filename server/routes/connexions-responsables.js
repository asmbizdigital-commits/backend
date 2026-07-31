const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { authenticateToken, requireRole } = require('../middleware/auth');
const ConnexionResponsable = require('../models/ConnexionResponsable');
const User = require('../models/User');
const DirectionProvinciale = require('../models/DirectionProvinciale');
const BureauInternational = require('../models/BureauInternational');

const router = express.Router();
router.use(authenticateToken);

const ROLE_RESPONSABLE_ZONE = 'Responsable Zone';
const ADMIN_ONLY = requireRole(['Administrateur']);

const userAttrs = ['id', 'nom', 'prenom', 'email', 'role', 'actif', 'zone'];
const directionAttrs = ['id', 'nom', 'code', 'province', 'statut'];
const bureauAttrs = ['id', 'nom', 'code', 'pays', 'ville', 'statut'];

function toIntIds(raw) {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw
        .map((v) => parseInt(String(v), 10))
        .filter((n) => !Number.isNaN(n) && n > 0)
    )
  ];
}

function formatLink(row) {
  const plain = typeof row.toJSON === 'function' ? row.toJSON() : row;
  return {
    id: plain.id,
    utilisateur_id: plain.utilisateurId ?? plain.utilisateur_id,
    direction_provinciale_id: plain.directionProvincialeId ?? plain.direction_provinciale_id ?? null,
    bureau_international_id: plain.bureauInternationalId ?? plain.bureau_international_id ?? null,
    created_by: plain.createdBy ?? plain.created_by ?? null,
    created_at: plain.createdAt ?? plain.created_at,
    updated_at: plain.updatedAt ?? plain.updated_at,
    directionProvinciale: plain.DirectionProvinciale || plain.directionProvinciale || null,
    bureauInternational: plain.BureauInternational || plain.bureauInternational || null,
    utilisateur: plain.Utilisateur || plain.utilisateur || null
  };
}

function groupByUtilisateur(links) {
  const map = new Map();
  for (const link of links) {
    const formatted = formatLink(link);
    const userId = formatted.utilisateur_id;
    if (!map.has(userId)) {
      map.set(userId, {
        utilisateur: formatted.utilisateur || {
          id: userId,
          nom: null,
          prenom: null,
          email: null,
          role: null
        },
        directions_provinciales: [],
        bureaux_internationaux: [],
        links: []
      });
    }
    const group = map.get(userId);
    group.links.push({
      id: formatted.id,
      direction_provinciale_id: formatted.direction_provinciale_id,
      bureau_international_id: formatted.bureau_international_id,
      created_at: formatted.created_at
    });
    if (formatted.directionProvinciale) {
      group.directions_provinciales.push(formatted.directionProvinciale);
    }
    if (formatted.bureauInternational) {
      group.bureaux_internationaux.push(formatted.bureauInternational);
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const an = `${a.utilisateur?.nom || ''} ${a.utilisateur?.prenom || ''}`.trim().toLowerCase();
    const bn = `${b.utilisateur?.nom || ''} ${b.utilisateur?.prenom || ''}`.trim().toLowerCase();
    return an.localeCompare(bn, 'fr');
  });
}

async function assertResponsableZone(userId) {
  const user = await User.findByPk(userId, { attributes: userAttrs });
  if (!user) {
    return { ok: false, status: 404, message: 'Utilisateur introuvable' };
  }
  if (user.role !== ROLE_RESPONSABLE_ZONE) {
    return {
      ok: false,
      status: 400,
      message: `Seuls les utilisateurs « ${ROLE_RESPONSABLE_ZONE} » peuvent être connectés.`
    };
  }
  if (!user.actif) {
    return { ok: false, status: 400, message: 'Cet utilisateur est inactif.' };
  }
  return { ok: true, user };
}

/**
 * GET /api/connexions-responsables
 * Liste groupée par Responsable Zone.
 */
router.get('/', ADMIN_ONLY, async (req, res) => {
  try {
    const links = await ConnexionResponsable.findAll({
      include: [
        { model: User, as: 'Utilisateur', attributes: userAttrs },
        { model: DirectionProvinciale, as: 'DirectionProvinciale', attributes: directionAttrs },
        { model: BureauInternational, as: 'BureauInternational', attributes: bureauAttrs }
      ],
      order: [['id', 'ASC']]
    });

    return res.json({
      success: true,
      connexions: groupByUtilisateur(links),
      total_links: links.length
    });
  } catch (error) {
    console.error('GET /connexions-responsables', error);
    return res.status(500).json({
      message: error.message || 'Erreur lors du chargement des connexions'
    });
  }
});

/**
 * GET /api/connexions-responsables/utilisateur/:userId
 */
router.get(
  '/utilisateur/:userId',
  ADMIN_ONLY,
  [param('userId').isInt({ min: 1 })],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Identifiant invalide', errors: errors.array() });
      }
      const userId = parseInt(req.params.userId, 10);
      const check = await assertResponsableZone(userId);
      if (!check.ok) {
        return res.status(check.status).json({ message: check.message });
      }

      const links = await ConnexionResponsable.findAll({
        where: { utilisateurId: userId },
        include: [
          { model: DirectionProvinciale, as: 'DirectionProvinciale', attributes: directionAttrs },
          { model: BureauInternational, as: 'BureauInternational', attributes: bureauAttrs }
        ],
        order: [['id', 'ASC']]
      });

      const grouped = groupByUtilisateur(
        links.map((l) => {
          const j = l.toJSON();
          j.Utilisateur = check.user.toJSON();
          return j;
        })
      );

      return res.json({
        success: true,
        connexion: grouped[0] || {
          utilisateur: check.user,
          directions_provinciales: [],
          bureaux_internationaux: [],
          links: []
        }
      });
    } catch (error) {
      console.error('GET /connexions-responsables/utilisateur/:userId', error);
      return res.status(500).json({ message: error.message || 'Erreur serveur' });
    }
  }
);

/**
 * PUT /api/connexions-responsables/utilisateur/:userId
 * Remplace toutes les liaisons d’un Responsable Zone.
 * Body: { direction_provinciale_ids: number[], bureau_international_ids: number[] }
 */
router.put(
  '/utilisateur/:userId',
  ADMIN_ONLY,
  [
    param('userId').isInt({ min: 1 }),
    body('direction_provinciale_ids').optional().isArray(),
    body('bureau_international_ids').optional().isArray()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Données invalides', errors: errors.array() });
      }

      const userId = parseInt(req.params.userId, 10);
      const check = await assertResponsableZone(userId);
      if (!check.ok) {
        return res.status(check.status).json({ message: check.message });
      }

      const directionIds = toIntIds(
        req.body.direction_provinciale_ids ?? req.body.directionProvincialeIds
      );
      const bureauIds = toIntIds(
        req.body.bureau_international_ids ?? req.body.bureauInternationalIds
      );

      if (!directionIds.length && !bureauIds.length) {
        return res.status(400).json({
          message: 'Sélectionnez au moins une direction provinciale ou un bureau international.'
        });
      }

      if (directionIds.length) {
        const found = await DirectionProvinciale.count({
          where: { id: { [Op.in]: directionIds } }
        });
        if (found !== directionIds.length) {
          return res.status(400).json({ message: 'Une ou plusieurs directions provinciales sont invalides.' });
        }
      }
      if (bureauIds.length) {
        const found = await BureauInternational.count({
          where: { id: { [Op.in]: bureauIds } }
        });
        if (found !== bureauIds.length) {
          return res.status(400).json({ message: 'Un ou plusieurs bureaux internationaux sont invalides.' });
        }
      }

      if (directionIds.length) {
        const takenDirs = await ConnexionResponsable.findAll({
          where: {
            directionProvincialeId: { [Op.in]: directionIds },
            utilisateurId: { [Op.ne]: userId }
          },
          include: [
            { model: User, as: 'Utilisateur', attributes: ['id', 'nom', 'prenom'] },
            { model: DirectionProvinciale, as: 'DirectionProvinciale', attributes: ['id', 'nom'] }
          ]
        });
        if (takenDirs.length) {
          const names = takenDirs
            .map((r) => r.DirectionProvinciale?.nom || `#${r.directionProvincialeId}`)
            .join(', ');
          return res.status(409).json({
            message: `Direction(s) déjà assignée(s) à un autre responsable : ${names}.`
          });
        }
      }

      if (bureauIds.length) {
        const takenBureaux = await ConnexionResponsable.findAll({
          where: {
            bureauInternationalId: { [Op.in]: bureauIds },
            utilisateurId: { [Op.ne]: userId }
          },
          include: [
            { model: User, as: 'Utilisateur', attributes: ['id', 'nom', 'prenom'] },
            { model: BureauInternational, as: 'BureauInternational', attributes: ['id', 'nom'] }
          ]
        });
        if (takenBureaux.length) {
          const names = takenBureaux
            .map((r) => r.BureauInternational?.nom || `#${r.bureauInternationalId}`)
            .join(', ');
          return res.status(409).json({
            message: `Bureau(x) déjà assigné(s) à un autre responsable : ${names}.`
          });
        }
      }

      await ConnexionResponsable.destroy({ where: { utilisateurId: userId } });

      const toCreate = [
        ...directionIds.map((directionProvincialeId) => ({
          utilisateurId: userId,
          directionProvincialeId,
          bureauInternationalId: null,
          createdBy: req.user.id
        })),
        ...bureauIds.map((bureauInternationalId) => ({
          utilisateurId: userId,
          directionProvincialeId: null,
          bureauInternationalId,
          createdBy: req.user.id
        }))
      ];

      await ConnexionResponsable.bulkCreate(toCreate);

      const links = await ConnexionResponsable.findAll({
        where: { utilisateurId: userId },
        include: [
          { model: User, as: 'Utilisateur', attributes: userAttrs },
          { model: DirectionProvinciale, as: 'DirectionProvinciale', attributes: directionAttrs },
          { model: BureauInternational, as: 'BureauInternational', attributes: bureauAttrs }
        ],
        order: [['id', 'ASC']]
      });

      return res.json({
        success: true,
        message: 'Connexions enregistrées.',
        connexion: groupByUtilisateur(links)[0]
      });
    } catch (error) {
      console.error('PUT /connexions-responsables/utilisateur/:userId', error);
      return res.status(500).json({
        message: error.message || 'Erreur lors de l\'enregistrement des connexions'
      });
    }
  }
);

/**
 * DELETE /api/connexions-responsables/utilisateur/:userId
 * Supprime toutes les liaisons d’un Responsable Zone.
 */
router.delete(
  '/utilisateur/:userId',
  ADMIN_ONLY,
  [param('userId').isInt({ min: 1 })],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Identifiant invalide' });
      }
      const userId = parseInt(req.params.userId, 10);
      const deleted = await ConnexionResponsable.destroy({ where: { utilisateurId: userId } });
      return res.json({
        success: true,
        message: 'Connexions du responsable supprimées.',
        deleted
      });
    } catch (error) {
      console.error('DELETE /connexions-responsables/utilisateur/:userId', error);
      return res.status(500).json({ message: error.message || 'Erreur lors de la suppression' });
    }
  }
);

/**
 * DELETE /api/connexions-responsables/:id
 * Supprime une liaison unitaire.
 */
router.delete(
  '/:id',
  ADMIN_ONLY,
  [param('id').isInt({ min: 1 })],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Identifiant invalide' });
      }
      const id = parseInt(req.params.id, 10);
      const row = await ConnexionResponsable.findByPk(id);
      if (!row) {
        return res.status(404).json({ message: 'Connexion introuvable' });
      }
      await row.destroy();
      return res.json({ success: true, message: 'Connexion supprimée.' });
    } catch (error) {
      console.error('DELETE /connexions-responsables/:id', error);
      return res.status(500).json({ message: error.message || 'Erreur lors de la suppression' });
    }
  }
);

module.exports = router;

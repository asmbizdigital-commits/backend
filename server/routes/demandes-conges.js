const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { authenticateToken, requireRole } = require('../middleware/auth');
const DemandeConge = require('../models/DemandeConge');
const { User, Employe, EmployeUser } = require('../models');

const TYPES_CONGE = ['conges_payes_annuels', 'maladie', 'maternite', 'paternite', 'sans_solde', 'deces_famille', 'mariage', 'autre'];
const ROLES_VIEW_ALL_CONGES = ['Administrateur', 'Superviseur RH'];

function canViewAllDemandesConges(role) {
  return ROLES_VIEW_ALL_CONGES.includes(role);
}

// GET /api/demandes-conges - Liste des demandes
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 50, statut, type_conge, employe_id, date_debut, date_fin, search } = req.query;
    const offset = (page - 1) * limit;
    const where = {};

    if (statut) where.statut = statut;
    if (type_conge) where.type_conge = type_conge;
    if (employe_id) where.employe_id = employe_id;
    if (date_debut || date_fin) {
      where.date_debut = {};
      if (date_debut) where.date_debut[Op.gte] = date_debut;
      if (date_fin) where.date_debut[Op.lte] = date_fin;
    }

    if (!canViewAllDemandesConges(req.user.role)) {
      where.demandeur_id = req.user.id;
    }

    const { count, rows } = await DemandeConge.findAndCountAll({
      where,
      include: [
        { model: Employe, as: 'employe', attributes: ['id', 'nom_famille', 'nom_usage', 'prenoms', 'matricule'] },
        { model: User, as: 'demandeur', attributes: ['id', 'nom', 'prenom', 'email'] },
        { model: User, as: 'validateur', attributes: ['id', 'nom', 'prenom'] }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    let data = rows;
    if (search) {
      const term = search.toLowerCase();
      data = rows.filter(d => {
        const nom = d.employe ? `${(d.employe.prenoms || '')} ${(d.employe.nom_famille || '')}`.toLowerCase() : '';
        return (d.motif && d.motif.toLowerCase().includes(term)) || nom.includes(term);
      });
    }

    res.json({
      success: true,
      data,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: count, pages: Math.ceil(count / limit) }
    });
  } catch (error) {
    console.error('Erreur récupération demandes congés:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// GET /api/demandes-conges/stats
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const where = {};
    if (!canViewAllDemandesConges(req.user.role)) where.demandeur_id = req.user.id;

    const total = await DemandeConge.count({ where });

    const parStatut = await DemandeConge.findAll({
      attributes: ['statut', [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']],
      where,
      group: ['statut'],
      raw: true
    });
    const par_type = await DemandeConge.findAll({
      attributes: ['type_conge', [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']],
      where,
      group: ['type_conge'],
      raw: true
    });

    const par_statut = {};
    parStatut.forEach(item => { par_statut[item.statut] = parseInt(item.count); });
    const par_type_obj = {};
    par_type.forEach(item => { par_type_obj[item.type_conge] = parseInt(item.count); });

    res.json({
      success: true,
      data: { total, par_statut, par_type: par_type_obj }
    });
  } catch (error) {
    console.error('Erreur stats demandes congés:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// GET /api/demandes-conges/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const demande = await DemandeConge.findByPk(req.params.id, {
      include: [
        { model: Employe, as: 'employe', attributes: ['id', 'nom_famille', 'nom_usage', 'prenoms', 'matricule', 'poste'] },
        { model: User, as: 'demandeur', attributes: ['id', 'nom', 'prenom', 'email'] },
        { model: User, as: 'validateur', attributes: ['id', 'nom', 'prenom'] }
      ]
    });
    if (!demande) {
      return res.status(404).json({ success: false, message: 'Demande non trouvée' });
    }
    if (!canViewAllDemandesConges(req.user.role) && demande.demandeur_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }
    res.json({ success: true, data: demande });
  } catch (error) {
    console.error('Erreur récupération demande congé:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// POST /api/demandes-conges - Créer une demande (tous les rôles authentifiés)
router.post('/',
  authenticateToken,
  [
    body('employe_id').isInt({ min: 1 }).withMessage('ID employé requis'),
    body('type_conge').isIn(TYPES_CONGE).withMessage('Type de congé invalide'),
    body('date_debut').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date de début invalide (AAAA-MM-JJ)'),
    body('date_fin').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date de fin invalide (AAAA-MM-JJ)'),
    body('nombre_jours').isInt({ min: 1 }).withMessage('Nombre de jours requis'),
    body('motif').trim().isLength({ min: 5 }).withMessage('Motif requis (min 5 caractères)'),
    body('piece_jointe_url').optional({ nullable: true }).isString()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const arr = errors.array();
        return res.status(400).json({ success: false, message: arr[0]?.msg || 'Données invalides', errors: arr });
      }

      const employe = await Employe.findByPk(req.body.employe_id);
      if (!employe) {
        return res.status(404).json({ success: false, message: 'Employé non trouvé' });
      }

      if (!canViewAllDemandesConges(req.user.role)) {
        const liaison = await EmployeUser.findOne({ where: { user_id: req.user.id } });
        const employeId = parseInt(req.body.employe_id, 10);
        if (!liaison || liaison.employe_id !== employeId) {
          return res.status(403).json({
            success: false,
            message: 'Vous ne pouvez soumettre une demande que pour votre fiche employé'
          });
        }
      }

      const payload = {
        employe_id: req.body.employe_id,
        type_conge: req.body.type_conge,
        date_debut: req.body.date_debut,
        date_fin: req.body.date_fin,
        nombre_jours: parseInt(req.body.nombre_jours, 10),
        motif: req.body.motif.trim(),
        piece_jointe_url: req.body.piece_jointe_url || null,
        demandeur_id: req.user.id,
        statut: 'en_attente'
      };

      const created = await DemandeConge.create(payload);
      const withRelations = await DemandeConge.findByPk(created.id, {
        include: [
          { model: Employe, as: 'employe', attributes: ['id', 'nom_famille', 'nom_usage', 'prenoms', 'matricule'] },
          { model: User, as: 'demandeur', attributes: ['id', 'nom', 'prenom', 'email'] }
        ]
      });

      res.status(201).json({ success: true, message: 'Demande de congé créée', data: withRelations });
    } catch (error) {
      console.error('Erreur création demande congé:', error);
      if (error.name === 'SequelizeForeignKeyConstraintError') {
        return res.status(400).json({ success: false, message: 'Employé ou utilisateur invalide' });
      }
      if (error.name === 'SequelizeValidationError' && error.errors?.length) {
        return res.status(400).json({ success: false, message: error.errors[0].message, errors: error.errors.map(e => ({ message: e.message })) });
      }
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// PUT /api/demandes-conges/:id - Modifier (seulement si en_attente)
router.put('/:id',
  authenticateToken,
  [
    body('type_conge').optional().isIn(TYPES_CONGE),
    body('date_debut').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
    body('date_fin').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
    body('nombre_jours').optional().isInt({ min: 1 }),
    body('motif').optional().trim().isLength({ min: 5 }),
    body('piece_jointe_url').optional({ nullable: true }).isString()
  ],
  async (req, res) => {
    try {
      const demande = await DemandeConge.findByPk(req.params.id);
      if (!demande) return res.status(404).json({ success: false, message: 'Demande non trouvée' });
      if (demande.statut !== 'en_attente') {
        return res.status(400).json({ success: false, message: 'Seules les demandes en attente peuvent être modifiées' });
      }
      const canEdit = ['Patron', 'Administrateur'].includes(req.user.role) || demande.demandeur_id === req.user.id;
      if (!canEdit) return res.status(403).json({ success: false, message: 'Non autorisé' });

      const upd = {};
      if (req.body.type_conge) upd.type_conge = req.body.type_conge;
      if (req.body.date_debut) upd.date_debut = req.body.date_debut;
      if (req.body.date_fin) upd.date_fin = req.body.date_fin;
      if (req.body.nombre_jours != null) upd.nombre_jours = parseInt(req.body.nombre_jours, 10);
      if (req.body.motif != null) upd.motif = req.body.motif.trim();
      if (req.body.piece_jointe_url !== undefined) upd.piece_jointe_url = req.body.piece_jointe_url || null;

      await demande.update(upd);
      const updated = await DemandeConge.findByPk(demande.id, {
        include: [
          { model: Employe, as: 'employe', attributes: ['id', 'nom_famille', 'nom_usage', 'prenoms', 'matricule'] },
          { model: User, as: 'demandeur', attributes: ['id', 'nom', 'prenom', 'email'] }
        ]
      });
      res.json({ success: true, message: 'Demande mise à jour', data: updated });
    } catch (error) {
      console.error('Erreur mise à jour demande congé:', error);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// PUT /api/demandes-conges/:id/status - Approuver / Rejeter (Superviseur RH, Patron, Admin)
router.put('/:id/status',
  authenticateToken,
  requireRole(ROLES_VIEW_ALL_CONGES),
  [
    body('statut').isIn(['approuve', 'rejete']).withMessage('Statut invalide'),
    body('commentaire_rh').optional().trim()
  ],
  async (req, res) => {
    try {
      const demande = await DemandeConge.findByPk(req.params.id, {
        include: [{ model: Employe, as: 'employe', attributes: ['id', 'nom_famille', 'prenoms'] }]
      });
      if (!demande) return res.status(404).json({ success: false, message: 'Demande non trouvée' });
      if (demande.statut !== 'en_attente') {
        return res.status(400).json({ success: false, message: 'Seules les demandes en attente peuvent être traitées' });
      }

      demande.statut = req.body.statut;
      demande.commentaire_rh = req.body.commentaire_rh || null;
      demande.validateur_id = req.user.id;
      demande.date_validation = new Date();
      await demande.save();

      const updated = await DemandeConge.findByPk(demande.id, {
        include: [
          { model: Employe, as: 'employe', attributes: ['id', 'nom_famille', 'nom_usage', 'prenoms', 'matricule'] },
          { model: User, as: 'demandeur', attributes: ['id', 'nom', 'prenom'] },
          { model: User, as: 'validateur', attributes: ['id', 'nom', 'prenom'] }
        ]
      });
      res.json({
        success: true,
        message: demande.statut === 'approuve' ? 'Demande approuvée' : 'Demande rejetée',
        data: updated
      });
    } catch (error) {
      console.error('Erreur changement statut demande congé:', error);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  }
);

// DELETE /api/demandes-conges/:id - Supprimer (seulement si en_attente)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const demande = await DemandeConge.findByPk(req.params.id);
    if (!demande) return res.status(404).json({ success: false, message: 'Demande non trouvée' });
    if (demande.statut !== 'en_attente') {
      return res.status(400).json({ success: false, message: 'Seules les demandes en attente peuvent être supprimées' });
    }
    const canDelete = ['Patron', 'Administrateur'].includes(req.user.role) || demande.demandeur_id === req.user.id;
    if (!canDelete) return res.status(403).json({ success: false, message: 'Non autorisé' });
    await demande.destroy();
    res.json({ success: true, message: 'Demande supprimée' });
  } catch (error) {
    console.error('Erreur suppression demande congé:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

module.exports = router;

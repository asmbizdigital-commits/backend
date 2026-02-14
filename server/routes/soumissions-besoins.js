const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { SoumissionBesoins, SoumissionBesoinsLigne, User, Inventaire, Chambre } = require('../models');
const Notification = require('../models/Notification');
const { Op } = require('sequelize');

const ROLES_SUPERVISEURS = ['Superviseur', 'Superviseur RH', 'Superviseur Technique', 'Superviseur Stock'];

const router = express.Router();
router.use(authenticateToken);

// GET /api/soumissions-besoins/superviseurs — Liste des utilisateurs ayant un rôle superviseur
router.get('/superviseurs', async (req, res) => {
  try {
    const users = await User.findAll({
      where: { role: { [Op.in]: ROLES_SUPERVISEURS }, actif: true },
      attributes: ['id', 'nom', 'prenom', 'email', 'role'],
      order: [['nom', 'ASC'], ['prenom', 'ASC']]
    });
    res.json({
      success: true,
      data: users.map(u => ({
        id: u.id,
        value: u.id,
        label: `${u.prenom || ''} ${u.nom || ''} (${u.role})`.trim() || u.email,
        nom: u.nom,
        prenom: u.prenom,
        role: u.role
      }))
    });
  } catch (error) {
    console.error('Erreur GET superviseurs:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération des superviseurs' });
  }
});

// GET /api/soumissions-besoins — Liste avec pagination
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, statut, type } = req.query;
    const offset = (page - 1) * limit;
    const where = {};
    if (statut) where.statut = statut;
    if (type) where.type = type;
    // Tous les utilisateurs voient leurs soumissions ; les superviseurs voient aussi celles dont ils sont destinataires
    const isSuperviseur = ROLES_SUPERVISEURS.includes(req.user.role);
    if (!isSuperviseur) {
      where.demandeur_id = req.user.id;
    } else {
      // Superviseur : voir ses soumissions + celles où il est superviseur ciblé
      where[Op.or] = [
        { demandeur_id: req.user.id },
        { superviseur_id: req.user.id }
      ];
    }
    const { count, rows } = await SoumissionBesoins.findAndCountAll({
      where,
      include: [
        { model: User, as: 'demandeur', attributes: ['id', 'nom', 'prenom', 'email'] },
        { model: User, as: 'superviseur', attributes: ['id', 'nom', 'prenom', 'role'] },
        {
          model: SoumissionBesoinsLigne,
          as: 'lignes',
          include: [
            { model: Inventaire, as: 'inventaire', attributes: ['id', 'nom', 'code_produit'] },
            { model: Chambre, as: 'chambre', attributes: ['id', 'numero', 'type'] }
          ]
        }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    res.json({
      success: true,
      data: rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: count, pages: Math.ceil(count / limit) }
    });
  } catch (error) {
    console.error('Erreur GET soumissions-besoins:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération' });
  }
});

// GET /api/soumissions-besoins/:id
router.get('/:id', async (req, res) => {
  try {
    const s = await SoumissionBesoins.findByPk(req.params.id, {
      include: [
        { model: User, as: 'demandeur', attributes: ['id', 'nom', 'prenom', 'email'] },
        { model: User, as: 'superviseur', attributes: ['id', 'nom', 'prenom', 'role'] },
        {
          model: SoumissionBesoinsLigne,
          as: 'lignes',
          include: [
            { model: Inventaire, as: 'inventaire', attributes: ['id', 'nom', 'code_produit', 'prix_unitaire'] },
            { model: Chambre, as: 'chambre', attributes: ['id', 'numero', 'type'] }
          ]
        }
      ]
    });
    if (!s) return res.status(404).json({ success: false, message: 'Soumission non trouvée' });
    const isSuperviseur = ROLES_SUPERVISEURS.includes(req.user.role);
    if (s.demandeur_id !== req.user.id && (!isSuperviseur || s.superviseur_id !== req.user.id)) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }
    res.json({ success: true, data: s });
  } catch (error) {
    console.error('Erreur GET soumission:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération' });
  }
});

// POST /api/soumissions-besoins — Créer
router.post('/', [
  body('type').isIn(['materiel', 'fonds']).withMessage('type invalide'),
  body('superviseur_id').isInt({ min: 1 }).withMessage('superviseur_id requis'),
  body('lignes').isArray().withMessage('lignes requis'),
  body('lignes.*').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    const { type, motif, commentaire, superviseur_id, lignes, devise = 'FC' } = req.body;
    const superviseur = await User.findByPk(superviseur_id);
    if (!superviseur || !ROLES_SUPERVISEURS.includes(superviseur.role)) {
      return res.status(400).json({ success: false, message: 'Superviseur invalide ou rôle non autorisé' });
    }
    if (!lignes || lignes.length === 0) {
      return res.status(400).json({ success: false, message: 'Au moins une ligne est requise' });
    }
    let montantTotal = null;
    if (type === 'fonds') {
      montantTotal = lignes.reduce((sum, l) => {
        if (l.type_ligne === 'article' && l.inventaire_id && l.quantite > 0 && l.prix_unitaire > 0) {
          return sum + parseFloat(l.quantite) * parseFloat(l.prix_unitaire);
        }
        if (l.libelle && l.montant > 0) return sum + parseFloat(l.montant);
        return sum;
      }, 0);
    }
    const s = await SoumissionBesoins.create({
      type,
      demandeur_id: req.user.id,
      superviseur_id,
      statut: 'en_attente',
      motif: motif || null,
      commentaire: commentaire || null,
      montant_total: montantTotal,
      devise: type === 'fonds' ? (devise || 'FC') : null
    });
    const lignesData = lignes.map(l => {
      if (type === 'materiel') {
        return {
          soumission_besoins_id: s.id,
          type_ligne: 'article',
          inventaire_id: l.inventaire_id || null,
          chambre_id: l.chambre_id || null,
          quantite: l.quantite_demandee || l.quantite || 1
        };
      }
      if (l.type_ligne === 'article' && l.inventaire_id && l.quantite > 0 && l.prix_unitaire > 0) {
        return {
          soumission_besoins_id: s.id,
          type_ligne: 'article',
          inventaire_id: l.inventaire_id,
          quantite: l.quantite,
          prix_unitaire: l.prix_unitaire,
          montant: parseFloat(l.quantite) * parseFloat(l.prix_unitaire),
          devise: devise || 'FC'
        };
      }
      return {
        soumission_besoins_id: s.id,
        type_ligne: 'libelle',
        libelle: l.libelle || '',
        montant: parseFloat(l.montant) || 0,
        devise: devise || 'FC'
      };
    }).filter(l => (type === 'materiel' && l.inventaire_id) || (type === 'fonds' && (l.montant > 0 || (l.quantite && l.prix_unitaire))));
    if (lignesData.length === 0) {
      await s.destroy();
      return res.status(400).json({ success: false, message: 'Au moins une ligne valide est requise' });
    }
    await SoumissionBesoinsLigne.bulkCreate(lignesData);
    const created = await SoumissionBesoins.findByPk(s.id, {
      include: [
        { model: User, as: 'demandeur', attributes: ['id', 'nom', 'prenom'] },
        { model: User, as: 'superviseur', attributes: ['id', 'nom', 'prenom', 'role'] },
        { model: SoumissionBesoinsLigne, as: 'lignes', include: [{ model: Inventaire, as: 'inventaire' }, { model: Chambre, as: 'chambre' }] }
      ]
    });

    // Notification envoyée uniquement au superviseur sélectionné
    const demandeur = req.user;
    const demandeurNom = demandeur?.nom ? `${demandeur.prenom || ''} ${demandeur.nom}`.trim() || demandeur.email : 'Un utilisateur';
    const typeLabel = type === 'materiel' ? 'matériel' : 'fonds';
    const notifPayload = {
      title: 'Nouvelle soumission de besoins',
      message: `${demandeurNom} a soumis un besoin en ${typeLabel} (soumission #${s.id}).`,
      type: 'info',
      link: '/soumissions-besoins',
      target_roles: JSON.stringify(['user:' + superviseur_id]),
      created_by: req.user.id
    };
    const notif = await Notification.create(notifPayload);
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${superviseur_id}`).emit('notification', {
        id: notif.id,
        title: notifPayload.title,
        message: notifPayload.message,
        type: notifPayload.type,
        link: notifPayload.link,
        target_roles: ['user:' + superviseur_id],
        created_at: notif.created_at
      });
    }

    res.status(201).json({ success: true, data: created });
  } catch (error) {
    console.error('Erreur POST soumissions-besoins:', error);
    res.status(500).json({ success: false, message: error.message || 'Erreur lors de la création' });
  }
});

// PUT /api/soumissions-besoins/:id — Modifier (uniquement si en_attente)
router.put('/:id', [
  body('motif').optional().isString(),
  body('commentaire').optional().isString(),
  body('lignes').optional().isArray()
], async (req, res) => {
  try {
    const s = await SoumissionBesoins.findByPk(req.params.id);
    if (!s) return res.status(404).json({ success: false, message: 'Soumission non trouvée' });
    if (s.demandeur_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }
    if (s.statut !== 'en_attente') {
      return res.status(400).json({ success: false, message: 'Modification impossible : soumission déjà traitée' });
    }
    const { motif, commentaire, lignes } = req.body;
    if (motif !== undefined) s.motif = motif;
    if (commentaire !== undefined) s.commentaire = commentaire;
    await s.save();
    if (lignes && Array.isArray(lignes)) {
      await SoumissionBesoinsLigne.destroy({ where: { soumission_besoins_id: s.id } });
      const lignesData = lignes.map(l => {
        if (s.type === 'materiel') {
          return {
            soumission_besoins_id: s.id,
            type_ligne: 'article',
            inventaire_id: l.inventaire_id || null,
            chambre_id: l.chambre_id || null,
            quantite: l.quantite_demandee || l.quantite || 1
          };
        }
        if (l.type_ligne === 'article' && l.inventaire_id && l.quantite > 0 && l.prix_unitaire > 0) {
          return {
            soumission_besoins_id: s.id,
            type_ligne: 'article',
            inventaire_id: l.inventaire_id,
            quantite: l.quantite,
            prix_unitaire: l.prix_unitaire,
            montant: parseFloat(l.quantite) * parseFloat(l.prix_unitaire),
            devise: s.devise || 'FC'
          };
        }
        return {
          soumission_besoins_id: s.id,
          type_ligne: 'libelle',
          libelle: l.libelle || '',
          montant: parseFloat(l.montant) || 0,
          devise: s.devise || 'FC'
        };
      }).filter(l => (s.type === 'materiel' && l.inventaire_id) || (s.type === 'fonds' && (l.montant > 0 || (l.quantite && l.prix_unitaire))));
      if (lignesData.length > 0) {
        await SoumissionBesoinsLigne.bulkCreate(lignesData);
      }
      if (s.type === 'fonds') {
        const updated = await SoumissionBesoins.findByPk(s.id, { include: [{ model: SoumissionBesoinsLigne, as: 'lignes' }] });
        s.montant_total = (updated.lignes || []).reduce((sum, l) => sum + parseFloat(l.montant || 0), 0);
        await s.save();
      }
    }
    const result = await SoumissionBesoins.findByPk(s.id, {
      include: [
        { model: User, as: 'demandeur', attributes: ['id', 'nom', 'prenom'] },
        { model: User, as: 'superviseur', attributes: ['id', 'nom', 'prenom', 'role'] },
        { model: SoumissionBesoinsLigne, as: 'lignes', include: [{ model: Inventaire, as: 'inventaire' }, { model: Chambre, as: 'chambre' }] }
      ]
    });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Erreur PUT soumissions-besoins:', error);
    res.status(500).json({ success: false, message: error.message || 'Erreur lors de la mise à jour' });
  }
});

// DELETE /api/soumissions-besoins/:id
router.delete('/:id', async (req, res) => {
  try {
    const s = await SoumissionBesoins.findByPk(req.params.id);
    if (!s) return res.status(404).json({ success: false, message: 'Soumission non trouvée' });
    if (s.demandeur_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }
    if (s.statut !== 'en_attente') {
      return res.status(400).json({ success: false, message: 'Suppression impossible : soumission déjà traitée' });
    }
    await s.destroy();
    res.json({ success: true, message: 'Soumission supprimée' });
  } catch (error) {
    console.error('Erreur DELETE soumissions-besoins:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la suppression' });
  }
});

// PUT /api/soumissions-besoins/:id/status — Approuver/Rejeter (superviseur ciblé uniquement)
router.put('/:id/status', [
  body('statut').isIn(['approuvee', 'rejetee']).withMessage('statut invalide'),
  body('commentaire_superviseur').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    const s = await SoumissionBesoins.findByPk(req.params.id);
    if (!s) return res.status(404).json({ success: false, message: 'Soumission non trouvée' });
    if (s.superviseur_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Seul le superviseur ciblé peut valider ou rejeter' });
    }
    if (s.statut !== 'en_attente') {
      return res.status(400).json({ success: false, message: 'Soumission déjà traitée' });
    }
    s.statut = req.body.statut;
    s.commentaire_superviseur = req.body.commentaire_superviseur || null;
    s.date_validation = new Date();
    await s.save();
    const result = await SoumissionBesoins.findByPk(s.id, {
      include: [
        { model: User, as: 'demandeur', attributes: ['id', 'nom', 'prenom'] },
        { model: User, as: 'superviseur', attributes: ['id', 'nom', 'prenom', 'role'] },
        { model: SoumissionBesoinsLigne, as: 'lignes', include: [{ model: Inventaire, as: 'inventaire' }, { model: Chambre, as: 'chambre' }] }
      ]
    });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Erreur PUT status soumissions-besoins:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour du statut' });
  }
});

module.exports = router;

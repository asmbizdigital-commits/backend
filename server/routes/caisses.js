// Version temporaire de server/routes/caisses.js avec logs de debug
// Remplacez le contenu de server/routes/caisses.js par ce code

const express = require('express');
const { body, validationResult } = require('express-validator');
const Caisse = require('../models/Caisse');
const User = require('../models/User');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { Op } = require('sequelize'); // Import Op pour les opérateurs de comparaison
const { sequelize } = require('../config/database'); // Import sequelize depuis notre configuration
const { QueryTypes } = require('sequelize');
const fs = require('fs'); // Import fs pour la suppression des fichiers temporaires

const TABLE_LIAISONS = 'tbl_liaisons_caissiers';

const router = express.Router();

// Appliquer l'authentification à toutes les routes
router.use(authenticateToken);

// GET /api/caisses/all - Récupérer toutes les caisses pour les selects (sans pagination)
router.get('/all', async (req, res) => {
  try {
    // Récupérer toutes les caisses (sans filtre de statut pour les selects)
    // L'utilisateur peut choisir parmi toutes les caisses disponibles
    const caisses = await Caisse.findAll({
      attributes: ['id', 'nom', 'code_caisse', 'devise', 'solde_initial', 'solde_actuel', 'statut', 'compte_fin_id'],
      order: [['nom', 'ASC']]
    });

    // Calculer le solde actuel pour chaque caisse
    const caissesAvecSolde = await Promise.all(
      caisses.map(async (caisse) => {
        try {
          const nouveauSolde = await caisse.calculerSoldeActuel();
          // Retourner un objet avec le solde actuel calculé
          return {
            id: caisse.id,
            nom: caisse.nom,
            code_caisse: caisse.code_caisse,
            devise: caisse.devise,
            solde_initial: caisse.solde_initial,
            solde_actuel: nouveauSolde,
            compte_fin_id: caisse.compte_fin_id || null
          };
        } catch (error) {
          console.error(`Erreur lors du calcul du solde pour la caisse ${caisse.id}:`, error);
          // Retourner la caisse avec le solde actuel existant si le calcul échoue
          return {
            id: caisse.id,
            nom: caisse.nom,
            code_caisse: caisse.code_caisse,
            devise: caisse.devise,
            solde_initial: caisse.solde_initial,
            solde_actuel: caisse.solde_actuel || 0,
            compte_fin_id: caisse.compte_fin_id || null
          };
        }
      })
    );

    res.json({
      success: true,
      caisses: caissesAvecSolde
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des caisses:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des caisses'
    });
  }
});

// GET /api/caisses - Récupérer toutes les caisses avec pagination et filtres
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      statut = '',
      devise = ''
    } = req.query;

    const offset = (page - 1) * limit;
    const whereClause = {};

    // Filtre de recherche
    if (search) {
      whereClause[Op.or] = [
        { nom: { [Op.like]: `%${search}%` } },
        { code_caisse: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
        { emplacement: { [Op.like]: `%${search}%` } }
      ];
    }

    // Filtre par statut
    if (statut) {
      whereClause.statut = statut;
    }

    // Filtre par devise
    if (devise) {
      whereClause.devise = devise;
    }

    // Récupérer les caisses avec pagination
    const { count, rows: caisses } = await Caisse.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']],
      include: [
        {
          model: require('../models/User'),
          as: 'responsable',
          attributes: ['id', 'nom', 'prenom', 'email']
        }
      ]
    });

    // Calculer le solde actuel pour chaque caisse
    const caissesAvecSolde = await Promise.all(
      caisses.map(async (caisse) => {
        try {
          await caisse.calculerSoldeActuel();
          return caisse;
        } catch (error) {
          console.error(`Erreur lors du calcul du solde pour la caisse ${caisse.id}:`, error);
          return caisse; // Retourner la caisse même si le calcul échoue
        }
      })
    );

    // Récupérer les guichetiers liés (tbl_liaisons_caissiers)
    const caisseIds = caissesAvecSolde.map((c) => c.id);
    let caissiersByCaisseId = {};
    if (caisseIds.length > 0) {
      try {
        const liaisons = await sequelize.query(
          `SELECT l.caisse_id, u.id, u.nom, u.prenom, u.email
           FROM ${TABLE_LIAISONS} l
           INNER JOIN tbl_utilisateurs u ON u.id = l.utilisateur_id
           WHERE l.caisse_id IN (${caisseIds.join(',')})`,
          { type: QueryTypes.SELECT }
        );
        (liaisons || []).forEach((r) => {
          caissiersByCaisseId[r.caisse_id] = { id: r.id, nom: r.nom, prenom: r.prenom, email: r.email };
        });
      } catch (e) {
        // Table ou jointure absente
      }
    }

    const caissesPourReponse = caissesAvecSolde.map((c) => {
      const plain = c.get ? c.get({ plain: true }) : c;
      return { ...plain, caissier: caissiersByCaisseId[c.id] || null };
    });

    const totalPages = Math.ceil(count / limit);

    res.json({
      success: true,
      caisses: caissesPourReponse,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des caisses:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des caisses'
    });
  }
});

// GET /api/caisses/:id - Récupérer une caisse par ID
router.get('/:id', async (req, res) => {
  try {
    const caisse = await Caisse.findByPk(req.params.id, {
      include: [
        {
          model: require('../models/User'),
          as: 'responsable',
          attributes: ['id', 'nom', 'prenom', 'email']
        }
      ]
    });

    if (!caisse) {
      return res.status(404).json({
        success: false,
        message: 'Caisse non trouvée'
      });
    }

    // Calculer le solde actuel avant d'envoyer la réponse
    try {
      await caisse.calculerSoldeActuel();
    } catch (error) {
      console.error(`Erreur lors du calcul du solde pour la caisse ${caisse.id}:`, error);
      // Continuer même si le calcul échoue
    }

    res.json({
      success: true,
      caisse
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de la caisse:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de la caisse'
    });
  }
});

// GET /api/caisses/:id/liaison-caissier - Récupérer le caissier lié à une caisse
router.get('/:id/liaison-caissier', requireRole(['Superviseur', 'Superviseur Finance', 'Administrateur', 'Patron']), async (req, res) => {
  try {
    const caisseId = parseInt(req.params.id, 10);
    const caisse = await Caisse.findByPk(caisseId);
    if (!caisse) {
      return res.status(404).json({ success: false, message: 'Caisse non trouvée' });
    }
    const rows = await sequelize.query(
      `SELECT l.id, l.caisse_id, l.utilisateur_id, l.created_at
       FROM ${TABLE_LIAISONS} l
       WHERE l.caisse_id = :caisseId LIMIT 1`,
      { replacements: { caisseId }, type: QueryTypes.SELECT }
    );
    const liaison = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    let caissier = null;
    if (liaison && liaison.utilisateur_id) {
      const u = await User.findByPk(liaison.utilisateur_id, { attributes: ['id', 'nom', 'prenom', 'email', 'role'] });
      if (u) caissier = { id: u.id, nom: u.nom, prenom: u.prenom, email: u.email, role: u.role };
    }
    return res.json({ success: true, liaison: liaison ? { id: liaison.id, caisse_id: liaison.caisse_id, utilisateur_id: liaison.utilisateur_id, created_at: liaison.created_at, caissier } : null });
  } catch (err) {
    console.error('Liaison caissier GET:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// PUT /api/caisses/:id/liaison-caissier - Lier ou mettre à jour le caissier d'une caisse
router.put('/:id/liaison-caissier', requireRole(['Superviseur', 'Superviseur Finance', 'Administrateur', 'Patron']), [
  body('utilisateur_id').optional().isInt({ min: 1 }).withMessage('utilisateur_id doit être un entier positif')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Validation échouée', errors: errors.array() });
    const caisseId = parseInt(req.params.id, 10);
    const utilisateurId = req.body.utilisateur_id ? parseInt(req.body.utilisateur_id, 10) : null;
    const caisse = await Caisse.findByPk(caisseId);
    if (!caisse) {
      return res.status(404).json({ success: false, message: 'Caisse non trouvée' });
    }
    if (utilisateurId) {
      const user = await User.findByPk(utilisateurId, { attributes: ['id', 'role'] });
      if (!user || user.role !== 'Guichetier') {
        return res.status(400).json({ success: false, message: 'L\'utilisateur doit avoir le rôle Guichetier' });
      }
    }
    const existing = await sequelize.query(
      `SELECT id FROM ${TABLE_LIAISONS} WHERE caisse_id = :caisseId LIMIT 1`,
      { replacements: { caisseId }, type: QueryTypes.SELECT }
    );
    if (Array.isArray(existing) && existing.length > 0) {
      if (utilisateurId) {
        await sequelize.query(
          `UPDATE ${TABLE_LIAISONS} SET utilisateur_id = :uid, updated_at = CURRENT_TIMESTAMP WHERE caisse_id = :caisseId`,
          { replacements: { uid: utilisateurId, caisseId }, type: QueryTypes.UPDATE }
        );
      } else {
        await sequelize.query(`DELETE FROM ${TABLE_LIAISONS} WHERE caisse_id = :caisseId`, { replacements: { caisseId }, type: QueryTypes.DELETE });
      }
    } else if (utilisateurId) {
      await sequelize.query(
        `INSERT INTO ${TABLE_LIAISONS} (caisse_id, utilisateur_id) VALUES (:caisseId, :uid)`,
        { replacements: { caisseId, uid: utilisateurId }, type: QueryTypes.INSERT }
      );
    }
    const rows = await sequelize.query(
      `SELECT id, caisse_id, utilisateur_id, created_at FROM ${TABLE_LIAISONS} WHERE caisse_id = :caisseId LIMIT 1`,
      { replacements: { caisseId }, type: QueryTypes.SELECT }
    );
    const liaison = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    return res.json({ success: true, message: utilisateurId ? 'Caissier lié avec succès' : 'Liaison supprimée', liaison });
  } catch (err) {
    console.error('Liaison caissier PUT:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// POST /api/caisses - Créer une nouvelle caisse
router.post('/', [
  requireRole(['Superviseur', 'Superviseur Finance']),
  body('nom')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Le nom doit contenir entre 2 et 100 caractères'),
  body('code_caisse')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le code caisse doit contenir entre 2 et 50 caractères'),
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('La description ne doit pas dépasser 1000 caractères'),
  body('emplacement')
    .optional()
    .isLength({ max: 100 })
    .withMessage('L\'emplacement ne doit pas dépasser 100 caractères'),
  body('solde_initial')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Le solde initial doit être un nombre positif'),
  body('devise')
    .optional()
    .isLength({ min: 2, max: 3 })
    .withMessage('La devise doit contenir entre 2 et 3 caractères'),
  body('statut')
    .optional()
    .isIn(['Active', 'Inactive', 'En maintenance', 'Fermée'])
    .withMessage('Statut invalide'),
  body('limite_retrait')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('La limite de retrait doit être un nombre positif'),
  body('limite_depot')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('La limite de dépôt doit être un nombre positif'),
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Les notes ne doivent pas dépasser 1000 caractères')
], async (req, res) => {
  try {
    // DEBUG: Log des données reçues
    console.log('🔍 === DEBUG CREATION CAISSE ===');
    console.log('📥 Body reçu:', JSON.stringify(req.body, null, 2));
    console.log('🔑 User:', req.user);
    console.log('📋 Headers:', req.headers);
    console.log('🔍 === FIN DEBUG ===');
    
    // Vérifier les erreurs de validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Erreurs de validation:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Données invalides',
        errors: errors.array()
      });
    }

    const {
      nom,
      code_caisse,
      description,
      emplacement,
      solde_initial,
      devise = 'EUR',
      statut = 'Active',
      limite_retrait,
      limite_depot,
      notes
    } = req.body;

    // Vérifier si le code caisse existe déjà
    const existingCaisse = await Caisse.findOne({
      where: { code_caisse }
    });

    if (existingCaisse) {
      return res.status(400).json({
        success: false,
        message: 'Ce code caisse existe déjà'
      });
    }

    // Créer la caisse
    const caisse = await Caisse.create({
      nom,
      code_caisse,
      description,
      emplacement,
      solde_initial: solde_initial || 0,
      solde_actuel: solde_initial || 0, // Le solde actuel commence par le solde initial
      devise,
      statut,
      responsable_id: req.user.id, // L'utilisateur connecté devient le responsable
      date_ouverture: new Date(),
      limite_retrait,
      limite_depot,
      notes
    });

    // Calculer le solde actuel après la création
    try {
      await caisse.calculerSoldeActuel();
    } catch (error) {
      console.error('Erreur lors du calcul initial du solde:', error);
      // Continuer même si le calcul échoue
    }

    res.status(201).json({
      success: true,
      message: 'Caisse créée avec succès',
      caisse
    });
  } catch (error) {
    console.error('Erreur lors de la création de la caisse:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur'
    });
  }
});

// PUT /api/caisses/:id - Mettre à jour une caisse
router.put('/:id', [
  requireRole(['Superviseur', 'Superviseur Finance']),
  body('nom')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Le nom doit contenir entre 2 et 100 caractères'),
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('La description ne doit pas dépasser 1000 caractères'),
  body('emplacement')
    .optional()
    .isLength({ max: 100 })
    .withMessage('L\'emplacement ne doit pas dépasser 100 caractères'),
  body('devise')
    .optional()
    .isLength({ min: 2, max: 3 })
    .withMessage('La devise doit contenir entre 2 et 3 caractères'),
  body('statut')
    .optional()
    .isIn(['Active', 'Inactive', 'En maintenance', 'Fermée'])
    .withMessage('Statut invalide'),
  body('limite_retrait')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('La limite de retrait doit être un nombre positif'),
  body('limite_depot')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('La limite de dépôt doit être un nombre positif'),
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Les notes ne doivent pas dépasser 1000 caractères'),
  body('compte_fin_id')
    .optional({ values: 'falsy', nullable: true })
    .custom((v) => v === null || v === undefined || (Number.isInteger(Number(v)) && Number(v) >= 0))
    .withMessage('Le compte Finances doit être un entier ou null pour dissocier')
], async (req, res) => {
  try {
    // Vérifier les erreurs de validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Données invalides',
        errors: errors.array()
      });
    }

    const caisse = await Caisse.findByPk(req.params.id);
    if (!caisse) {
      return res.status(404).json({
        success: false,
        message: 'Caisse non trouvée'
      });
    }

    const updateData = { ...req.body };
    if ('compte_fin_id' in req.body) updateData.compte_fin_id = req.body.compte_fin_id ? parseInt(req.body.compte_fin_id, 10) : null;
    // Mettre à jour la caisse
    await caisse.update(updateData);

    res.json({
      success: true,
      message: 'Caisse mise à jour avec succès',
      caisse
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la caisse:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour de la caisse'
    });
  }
});

// DELETE /api/caisses/:id - Supprimer une caisse
router.delete('/:id', requireRole(['Superviseur', 'Superviseur Finance']), async (req, res) => {
  try {
    const caisse = await Caisse.findByPk(req.params.id);
    if (!caisse) {
      return res.status(404).json({
        success: false,
        message: 'Caisse non trouvée'
      });
    }

    await caisse.destroy();

    res.json({
      success: true,
      message: 'Caisse supprimée avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression de la caisse:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression de la caisse'
    });
  }
});

// PATCH /api/caisses/:id/status - Changer le statut d'une caisse
router.patch('/:id/status', requireRole(['Superviseur', 'Superviseur Finance']), async (req, res) => {
  try {
    const { statut } = req.body;
    
    if (!['Active', 'Inactive', 'En maintenance', 'Fermée'].includes(statut)) {
      return res.status(400).json({
        success: false,
        message: 'Statut invalide'
      });
    }

    const caisse = await Caisse.findByPk(req.params.id);
    if (!caisse) {
      return res.status(404).json({
        success: false,
        message: 'Caisse non trouvée'
      });
    }

    await caisse.update({ statut });

    res.json({
      success: true,
      message: 'Statut de la caisse mis à jour avec succès',
      caisse
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du statut:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du statut'
    });
  }
});

// POST /api/caisses/:id/recalculer-solde - Recalculer le solde actuel d'une caisse
router.post('/:id/recalculer-solde', requireRole(['Superviseur', 'Superviseur Finance', 'Administrateur', 'Patron']), async (req, res) => {
  try {
    console.log('🔄 Début du recalcul du solde pour la caisse:', req.params.id);
    
    const caisse = await Caisse.findByPk(req.params.id);
    if (!caisse) {
      console.log('❌ Caisse non trouvée:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Caisse non trouvée'
      });
    }

    console.log('✅ Caisse trouvée:', {
      id: caisse.id,
      nom: caisse.nom,
      solde_initial: caisse.solde_initial,
      devise: caisse.devise
    });

    // Recalculer le solde actuel
    console.log('🔄 Calcul du solde actuel...');
    const nouveauSolde = await caisse.calculerSoldeActuel();
    console.log('✅ Nouveau solde calculé:', nouveauSolde);

    res.json({
      success: true,
      message: 'Solde recalculé avec succès',
      caisse: {
        id: caisse.id,
        nom: caisse.nom,
        solde_initial: caisse.solde_initial,
        solde_actuel: nouveauSolde,
        devise: caisse.devise
      }
    });
  } catch (error) {
    console.error('❌ Erreur lors du recalcul du solde:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du recalcul du solde',
      error: error.message
    });
  }
});

// GET /api/caisses/:id/transactions - Récupérer les transactions d'une caisse avec pagination
router.get('/:id/transactions', requireRole(['Superviseur', 'Superviseur Finance', 'Administrateur', 'Patron', 'Guichetier']), async (req, res) => {
  try {
    console.log('🔍 Récupération des transactions pour la caisse:', req.params.id);
    
    // Paramètres de pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    console.log('📄 Paramètres de pagination:', { page, limit, offset });
    
    const caisse = await Caisse.findByPk(req.params.id);
    if (!caisse) {
      console.log('❌ Caisse non trouvée:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Caisse non trouvée'
      });
    }

    console.log('✅ Caisse trouvée:', {
      id: caisse.id,
      nom: caisse.nom,
      devise: caisse.devise,
      solde_initial: caisse.solde_initial
    });

    const Encaissement = require('../models/Encaissement');
    const Depense = require('../models/Depense');
    const PaiementPartiel = require('../models/PaiementPartiel');

    // Récupérer le nombre total de transactions pour la pagination
    console.log('🔍 Comptage total des transactions...');
    const totalCount = await sequelize.query(`
      SELECT 
        (SELECT COUNT(*) FROM tbl_encaissements WHERE encaissement_caisse_id = ? AND statut = 'Validé') +
        (SELECT COUNT(*) FROM tbl_paiements_partiels WHERE caisse_id = ?) +
        (SELECT COUNT(*) FROM tbl_depenses WHERE caisse_id = ? AND statut IN ('Approuvée', 'Payée'))
        as total
    `, {
      replacements: [caisse.id, caisse.id, caisse.id],
      type: sequelize.QueryTypes.SELECT
    });
    
    const totalTransactions = parseInt(totalCount[0]?.total || 0);
    const totalPages = Math.ceil(totalTransactions / limit);
    
    console.log('📊 Total des transactions:', totalTransactions, 'Pages totales:', totalPages);

    // Récupérer TOUTES les transactions d'abord, puis appliquer la pagination
    console.log('🔍 Recherche de toutes les transactions...');
    const allEncaissements = await sequelize.query(`
      SELECT 
        p.id, p.reference, p.montant, p.devise, p.type_paiement, p.statut, 
        p.date_paiement, p.user_guichet_id, p.created_by,
        p.description
      FROM tbl_encaissements p
      WHERE p.encaissement_caisse_id = ? AND p.statut = 'Validé'
      ORDER BY p.date_paiement DESC
    `, {
      replacements: [caisse.id],
      type: sequelize.QueryTypes.SELECT
    });

    const allPaiementsPartiels = await sequelize.query(`
      SELECT 
        pp.id, pp.reference_paiement as reference, pp.montant, 'USD' as devise, pp.mode_paiement as type_paiement, 'Validé' as statut,
        pp.date_paiement, pp.utilisateur_id, pp.notes as description
      FROM tbl_paiements_partiels pp
      WHERE pp.caisse_id = ? 
      ORDER BY pp.date_paiement DESC
    `, {
      replacements: [caisse.id],
      type: sequelize.QueryTypes.SELECT
    });

    const allDepenses = await sequelize.query(`
      SELECT 
        d.id, d.numero_facture, d.montant, d.devise, d.statut, 
        d.date_depense, d.demandeur_id, d.approbateur_id,
        d.description
      FROM tbl_depenses d
      WHERE d.caisse_id = ? AND d.statut IN ('Approuvée', 'Payée')
      ORDER BY d.date_depense DESC
    `, {
      replacements: [caisse.id],
      type: sequelize.QueryTypes.SELECT
    });

    console.log('📊 Total récupéré - Encaissements:', allEncaissements.length, 'Paiements partiels:', allPaiementsPartiels.length, 'Dépenses:', allDepenses.length);

    // Combiner et trier toutes les transactions
    const allTransactions = [
      ...allEncaissements.map(p => ({
        ...p,
        type: 'Encaissement',
        date: p.date_paiement,
        type_paiement: p.type_paiement || 'Encaissement'
      })),
      ...allPaiementsPartiels.map(pp => ({
        ...pp,
        type: 'Dépense',
        date: pp.date_paiement,
        type_paiement: 'Dépense Partielle',
        user_guichet_id: pp.utilisateur_id
      })),
      ...allDepenses.map(d => ({
        ...d,
        type: 'Dépense',
        date: d.date_depense,
        type_paiement: 'Dépense',
        user_guichet_id: d.demandeur_id
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Appliquer la pagination au résultat final
    const startIndex = offset;
    const endIndex = startIndex + limit;
    const transactions = allTransactions.slice(startIndex, endIndex);

    console.log('📊 Transactions paginées:', transactions.length, 'sur', allTransactions.length, '(page', page, ')');

    // Calculer le résumé avec sécurité pour les tableaux vides
    // totalEncaissements = revenus (argent qui entre dans la caisse)
    const totalEncaissements = Array.isArray(allEncaissements) ? allEncaissements.reduce((sum, p) => sum + parseFloat(p.montant || 0), 0) : 0;
    
    // totalDecaissements = dépenses régulières
    const totalDecaissements = Array.isArray(allDepenses) ? allDepenses.reduce((sum, d) => sum + parseFloat(d.montant || 0), 0) : 0;
    
    // totalPaiementsPartiels = paiements partiels aux fournisseurs (décaissements)
    const totalPaiementsPartiels = Array.isArray(allPaiementsPartiels) ? allPaiementsPartiels.reduce((sum, pp) => sum + parseFloat(pp.montant || 0), 0) : 0;
    
    const soldeInitial = parseFloat(caisse.solde_initial || 0);
    
    // Total des décaissements = dépenses + paiements partiels
    // Solde calculé = solde initial + encaissements - (décaissements + paiements partiels)
    const totalDepensesComplet = totalDecaissements + totalPaiementsPartiels;
    const soldeCalcule = soldeInitial + totalEncaissements - totalDepensesComplet;

    const summary = {
      totalPaiements: totalEncaissements, // pour compatibilité avec le frontend
      totalPaiementsPartiels,
      totalDepenses: totalDecaissements, // pour compatibilité avec le frontend
      totalDepensesComplet, // Dépenses + Paiements partiels
      soldeInitial,
      soldeCalcule
    };

    console.log('✅ Transactions récupérées:', {
      caisseId: caisse.id,
      paiementsCount: allEncaissements.length,
      paiementsPartielsCount: allPaiementsPartiels.length,
      depensesCount: allDepenses.length,
      totalEncaissements,
      totalPaiementsPartiels,
      totalDecaissements,
      soldeCalcule,
      pagination: { page, limit, totalPages, totalTransactions }
    });

    res.json({
      success: true,
      transactions,
      summary,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: totalTransactions,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des transactions',
      error: error.message
    });
  }
});

// GET /api/caisses/:id/transactions/pdf - Générer un rapport PDF des transactions
router.get('/:id/transactions/pdf', requireRole(['Superviseur', 'Superviseur Finance', 'Administrateur', 'Patron']), async (req, res) => {
  try {
    console.log('🔍 Génération du rapport PDF pour la caisse:', req.params.id);
    
    const caisse = await Caisse.findByPk(req.params.id);
    if (!caisse) {
      console.log('❌ Caisse non trouvée:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Caisse non trouvée'
      });
    }

    console.log('✅ Caisse trouvée:', {
      id: caisse.id,
      nom: caisse.nom,
      devise: caisse.devise
    });

    const Encaissement = require('../models/Encaissement');
    const Depense = require('../models/Depense');
    const PaiementPartiel = require('../models/PaiementPartiel');

    // Récupérer TOUTES les transactions (sans pagination pour le PDF)
    console.log('🔍 Récupération de toutes les transactions pour le PDF...');
    
    const allEncaissements = await sequelize.query(`
      SELECT 
        p.id, p.reference, p.montant, p.devise, p.type_paiement, p.statut, 
        p.date_paiement, p.user_guichet_id, p.created_by,
        p.description
      FROM tbl_encaissements p
      WHERE p.encaissement_caisse_id = ? AND p.statut = 'Validé'
      ORDER BY p.date_paiement DESC
    `, {
      replacements: [caisse.id],
      type: sequelize.QueryTypes.SELECT
    });

    const allPaiementsPartiels = await sequelize.query(`
      SELECT 
        pp.id, pp.reference_paiement as reference, pp.montant, 'USD' as devise, pp.mode_paiement as type_paiement, 'Validé' as statut,
        pp.date_paiement, pp.utilisateur_id, pp.notes as description
      FROM tbl_paiements_partiels pp
      WHERE pp.caisse_id = ? 
      ORDER BY pp.date_paiement DESC
    `, {
      replacements: [caisse.id],
      type: sequelize.QueryTypes.SELECT
    });

    const allDepenses = await sequelize.query(`
      SELECT 
        d.id, d.numero_facture, d.montant, d.devise, d.statut, 
        d.date_depense, d.demandeur_id, d.approbateur_id,
        d.description
      FROM tbl_depenses d
      WHERE d.caisse_id = ? AND d.statut IN ('Approuvée', 'Payée')
      ORDER BY d.date_depense DESC
    `, {
      replacements: [caisse.id],
      type: sequelize.QueryTypes.SELECT
    });

    console.log('📊 Total récupéré pour le PDF - Paiements:', allEncaissements.length, 'Paiements partiels:', allPaiementsPartiels.length, 'Dépenses:', allDepenses.length);

    // Combiner et trier toutes les transactions
    const allTransactions = [
      ...allEncaissements.map(p => ({
        ...p,
        type: 'Encaissement',
        date: p.date_paiement,
        type_paiement: p.type_paiement || 'Encaissement'
      })),
      ...allPaiementsPartiels.map(pp => ({
        ...pp,
        type: 'Dépense',
        date: pp.date_paiement,
        type_paiement: 'Dépense Partielle',
        user_guichet_id: pp.utilisateur_id
      })),
      ...allDepenses.map(d => ({
        ...d,
        type: 'Dépense',
        date: d.date_depense,
        type_paiement: 'Dépense',
        user_guichet_id: d.demandeur_id
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Calculer le résumé pour PDF avec la même logique que la route principale
    const totalEncaissementsPDF = allEncaissements.reduce((sum, p) => sum + parseFloat(p.montant || 0), 0);
    const totalDecaissementsPDF = allDepenses.reduce((sum, d) => sum + parseFloat(d.montant || 0), 0);
    const totalPaiementsPartielsPDF = allPaiementsPartiels.reduce((sum, pp) => sum + parseFloat(pp.montant || 0), 0);
    const soldeInitial = parseFloat(caisse.solde_initial || 0);
    
    // Total des décaissements = dépenses + paiements partiels
    const totalDepensesComplet = totalDecaissementsPDF + totalPaiementsPartielsPDF;
    const soldeCalcule = soldeInitial + totalEncaissementsPDF - totalDepensesComplet;

    const summary = {
      totalPaiements: totalEncaissementsPDF, // pour compatibilité
      totalPaiementsPartiels: totalPaiementsPartielsPDF,
      totalDepenses: totalDecaissementsPDF, // pour compatibilité
      totalDepensesComplet,
      soldeInitial,
      soldeCalcule
    };

    console.log('📊 Résumé calculé pour le PDF:', summary);

    // Générer le PDF
    const pdfService = require('../services/pdfService');
    const { filename, filepath } = await pdfService.generateTransactionsReport(caisse, allTransactions, summary);

    console.log('✅ PDF généré avec succès:', filename);

    // Envoyer le fichier PDF
    res.download(filepath, filename, (err) => {
      if (err) {
        console.error('❌ Erreur lors de l\'envoi du PDF:', err);
        res.status(500).json({
          success: false,
          message: 'Erreur lors de l\'envoi du PDF'
        });
      } else {
        // Supprimer le fichier temporaire après envoi
        fs.unlink(filepath, (unlinkErr) => {
          if (unlinkErr) {
            console.error('⚠️ Erreur lors de la suppression du fichier temporaire:', unlinkErr);
          }
        });
      }
    });

  } catch (error) {
    console.error('❌ Erreur lors de la génération du PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la génération du PDF',
      error: error.message
    });
  }
});

module.exports = router; 
/**
 * Routes pour la réinitialisation des tables
 * Réinitialisation des données — Administrateur (par module) ou Web Master (tables legacy)
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth');
const resetService = require('../services/resetService');

const router = express.Router();

const RESET_ADMIN_ROLES = ['Administrateur', 'Web Master'];

// Appliquer l'authentification à toutes les routes
router.use(authenticateToken);

router.use(requireRole(RESET_ADMIN_ROLES));

// GET /api/reset/modules — modules menu (réinitialisation atomique)
router.get('/modules', async (req, res) => {
  try {
    res.json({
      success: true,
      modules: resetService.listModules()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// GET /api/reset/modules/resolve?path=/departements
router.get('/modules/resolve', async (req, res) => {
  try {
    const pathname = req.query.path || '';
    const moduleKey = resetService.resolveModuleKeyFromPath(pathname);
    if (!moduleKey) {
      return res.json({ success: true, moduleKey: null, module: null });
    }
    res.json({
      success: true,
      moduleKey,
      module: resetService.getModuleDefinition(moduleKey)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/reset/module/:moduleKey — réinitialisation atomique (Administrateur)
router.post('/module/:moduleKey', [
  body('confirm').isBoolean().withMessage('La confirmation est requise')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    if (req.user?.role !== 'Administrateur') {
      return res.status(403).json({
        success: false,
        message: 'Seul un Administrateur peut réinitialiser un module depuis le menu.'
      });
    }

    const { moduleKey } = req.params;
    const { confirm } = req.body;

    if (!confirm) {
      return res.status(400).json({
        success: false,
        message: 'Vous devez confirmer la réinitialisation'
      });
    }

    const def = resetService.getModuleDefinition(moduleKey);
    if (!def) {
      return res.status(400).json({
        success: false,
        message: `Module « ${moduleKey} » non supporté`
      });
    }

    const result = await resetService.resetModule(moduleKey);
    if (result.success) {
      return res.json({
        success: true,
        message: result.message,
        module: moduleKey,
        label: result.label
      });
    }
    return res.status(500).json({
      success: false,
      message: result.error || 'Échec de la réinitialisation'
    });
  } catch (error) {
    console.error('reset module:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Routes legacy (modal header) — Web Master uniquement
router.use('/table', requireRole(['Web Master']));
router.use('/all', requireRole(['Web Master']));

// GET /api/reset/tables - Obtenir la liste des tables disponibles
router.get('/tables', requireRole(['Web Master']), async (req, res) => {
  try {
    const tables = resetService.getAvailableTables();
    
    res.json({
      success: true,
      message: 'Tables disponibles pour la réinitialisation',
      tables
    });
    
  } catch (error) {
    console.error('Erreur lors de la récupération des tables:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des tables',
      message: error.message
    });
  }
});

// POST /api/reset/table/:tableName - Réinitialiser une table spécifique
router.post('/table/:tableName', [
  body('keepImages').optional().isBoolean(),
  body('keepAdmin').optional().isBoolean(),
  body('confirm').isBoolean().withMessage('La confirmation est requise')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: errors.array()
      });
    }

    const { tableName } = req.params;
    const { keepImages = false, keepAdmin = true, confirm } = req.body;

    // Vérifier la confirmation
    if (!confirm) {
      return res.status(400).json({
        success: false,
        error: 'Confirmation requise',
        message: 'Vous devez confirmer la réinitialisation'
      });
    }

    // Vérifier que la table existe
    const availableTables = resetService.getAvailableTables();
    const tableExists = availableTables.find(t => t.name === tableName);
    
    if (!tableExists) {
      return res.status(400).json({
        success: false,
        error: 'Table invalide',
        message: `Table '${tableName}' non supportée`
      });
    }

    console.log(`🔄 Demande de réinitialisation de la table: ${tableName}`);
    console.log(`📋 Options: keepImages=${keepImages}, keepAdmin=${keepAdmin}`);

    // Effectuer la réinitialisation
    const result = await resetService.resetTable(tableName, {
      keepImages,
      keepAdmin
    });

    if (result.success) {
      res.json({
        success: true,
        message: `Table ${tableExists.displayName} réinitialisée avec succès`,
        table: tableName,
        details: result.details
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la réinitialisation',
        message: result.error
      });
    }

  } catch (error) {
    console.error('Erreur lors de la réinitialisation:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la réinitialisation',
      message: error.message
    });
  }
});

// POST /api/reset/all - Réinitialiser toutes les tables
router.post('/all', [
  body('keepImages').optional().isBoolean(),
  body('keepAdmin').optional().isBoolean(),
  body('confirm').isBoolean().withMessage('La confirmation est requise')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: errors.array()
      });
    }

    const { keepImages = false, keepAdmin = true, confirm } = req.body;

    // Vérifier la confirmation
    if (!confirm) {
      return res.status(400).json({
        success: false,
        error: 'Confirmation requise',
        message: 'Vous devez confirmer la réinitialisation complète'
      });
    }

    console.log('🔄 Demande de réinitialisation de toutes les tables');
    console.log(`📋 Options: keepImages=${keepImages}, keepAdmin=${keepAdmin}`);

    // Effectuer la réinitialisation globale
    const result = await resetService.resetAllTables({
      keepImages,
      keepAdmin
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'Toutes les tables ont été réinitialisées avec succès',
        results: result.results
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la réinitialisation globale',
        message: result.error
      });
    }

  } catch (error) {
    console.error('Erreur lors de la réinitialisation globale:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la réinitialisation globale',
      message: error.message
    });
  }
});

// GET /api/reset/status - Obtenir le statut des tables
router.get('/status', requireRole(['Web Master']), async (req, res) => {
  try {
    const tables = resetService.getAvailableTables();
    
    const status = {};
    
    // Mapping des noms de tables vers les modèles
    const modelMapping = {
      problematiques: require('../models/Problematique'),
      depenses: require('../models/Depense'),
      users: require('../models/User'),
      chambres: require('../models/Chambre'),
      departements: require('../models/Departement'),
      taches: require('../models/Tache'),
      demandes: require('../models/Demande'),
      caisses: require('../models/Caisse'),
      paiements: require('../models/Paiement'),
      notifications: require('../models/Notification'),
      affectations_chambres: require('../models/AffectationChambre'),
      inventaire: require('../models/Inventaire'),
      fournisseurs: require('../models/Fournisseur'),
      achats: require('../models/Achat'),
      lignes_achat: require('../models/LigneAchat'),
      mouvements_stock: require('../models/MouvementStock'),
      entrepots: require('../models/Entrepot'),
      demandes_affectation: require('../models/DemandeAffectation'),
      demandes_affectation_lignes: require('../models/DemandeAffectationLigne'),
      demandes_fonds: require('../models/DemandeFonds'),
      lignes_demandes_fonds: require('../models/LigneDemandeFonds'),
      fiches_execution: require('../models/FicheExecution'),
      elements_intervention: require('../models/ElementIntervention'),
      cycle_vie_articles: require('../models/CycleVieArticle'),
      buanderie: require('../models/Buanderie'),
      paiements_partiels: require('../models/PaiementPartiel'),
      rappels_paiement: require('../models/RappelPaiement')
    };
    
    for (const table of tables) {
      try {
        const model = modelMapping[table.name];
        if (model) {
          const count = await model.count();
          status[table.name] = {
            name: table.displayName,
            count,
            hasData: count > 0
          };
          console.log(`📊 Table ${table.name}: ${count} enregistrements`);
        } else {
          status[table.name] = {
            name: table.displayName,
            count: 0,
            hasData: false,
            error: 'Modèle non trouvé'
          };
        }
      } catch (error) {
        console.error(`❌ Erreur pour la table ${table.name}:`, error.message);
        status[table.name] = {
          name: table.displayName,
          count: 0,
          hasData: false,
          error: error.message
        };
      }
    }
    
    console.log('📋 Statut final des tables:', status);
    
    res.json({
      success: true,
      message: 'Statut des tables récupéré',
      status
    });
    
  } catch (error) {
    console.error('Erreur lors de la récupération du statut:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération du statut',
      message: error.message
    });
  }
});

module.exports = router;

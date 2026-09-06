const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Chambre = require('../models/Chambre');
const AffectationChambre = require('../models/AffectationChambre');
const Problematique = require('../models/Problematique');
const Tache = require('../models/Tache');
const User = require('../models/User');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// PUBLIC: options for selects (no auth)
router.get('/public-options', async (req, res) => {
  try {
    const { Op } = require('sequelize');
    const limit = Math.min(parseInt(req.query.limit) || 1000, 5000);
    const search = req.query.search;

    const whereClause = {};
    if (search) {
      whereClause[Op.or] = [
        { numero: { [Op.like]: `%${search}%` } },
        { type: { [Op.like]: `%${search}%` } }
      ];
    }

    const chambres = await Chambre.findAll({
      attributes: ['id', 'numero', 'type', 'statut'],
      where: whereClause,
      order: [['numero', 'ASC']],
      limit
    });

    res.json({ success: true, data: chambres });
  } catch (error) {
    console.error('Error fetching public room options:', error);
    res.status(500).json({ success: false, message: 'Erreur lors du chargement des espaces' });
  }
});

// Apply authentication to all routes after public endpoint
router.use(authenticateToken);

// GET /api/chambres - Get all rooms with filtering
router.get('/', [
  query('statut').optional().isIn(['Libre', 'Occupé', 'En nettoyage', 'En maintenance', 'Réservé', 'Fermé', 'Service en cours', 'En cours d\'utilisation', 'Plein', 'Fermeture saisonnière', 'En entretien', 'En inventaire']),
  query('type').optional().isIn(['Chambre', 'Bureau administratif', 'Salle de fête', 'Salle de réunion', 'Restaurant', 'Bar', 'Spa', 'Gym', 'Parking', 'Piscine', 'Jardin', 'Terrasse', 'Cuisine', 'Entrepôt', 'Autre']),
  query('etage').optional().isInt({ min: 0, max: 50 }),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 1000 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Paramètres de validation invalides',
        errors: errors.array()
      });
    }

    const { statut, type, etage, page = 1, limit } = req.query;
    
    // Build where clause
    const whereClause = {};
    if (statut) whereClause.statut = statut;
    if (type) whereClause.type = type;
    if (etage) whereClause.etage = etage;

    // Si limit est fourni et élevé (>100), permettre jusqu'à 1000 pour les sélecteurs
    const parsedLimit = limit ? parseInt(limit) : 20;
    const effectiveLimit = parsedLimit > 100 ? Math.min(parsedLimit, 1000) : parsedLimit;
    const offset = page ? (parseInt(page) - 1) * effectiveLimit : 0;

    const { count, rows: chambres } = await Chambre.findAndCountAll({
      where: whereClause,
      limit: effectiveLimit,
      offset: offset,
      order: [['numero', 'ASC']]
    });

    res.json({
      chambres,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ 
      error: 'Failed to get rooms',
      message: 'Erreur lors de la récupération des chambres'
    });
  }
});

// GET /api/chambres/:id - Get specific room
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const chambre = await Chambre.findByPk(id);

    if (!chambre) {
      return res.status(404).json({ 
        error: 'Room not found',
        message: 'Chambre non trouvée'
      });
    }

    res.json({ chambre });

  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({ 
      error: 'Failed to get room',
      message: 'Erreur lors de la récupération de la chambre'
    });
  }
});

// POST /api/chambres - Create new room (temporarily allowing all authenticated users for testing)
router.post('/', [
  requireRole('Superviseur', 'Administrateur', 'Patron'),
  body('numero').isLength({ min: 1, max: 20 }),
  body('type').isIn(['Chambre', 'Bureau administratif', 'Salle de fête', 'Salle de réunion', 'Restaurant', 'Bar', 'Spa', 'Gym', 'Parking', 'Piscine', 'Jardin', 'Terrasse', 'Cuisine', 'Entrepôt', 'Autre']),
  body('categorie').optional().isIn(['Standard', 'Confort', 'Premium', 'Suite', 'Familiale', 'Accessible']),
  body('statut').isIn(['Libre', 'Occupé', 'En nettoyage', 'En maintenance', 'Réservé', 'Fermé', 'Service en cours', 'En cours d\'utilisation', 'Plein', 'Fermeture saisonnière', 'En entretien', 'En inventaire']),
  body('capacite').optional().isInt({ min: 1, max: 100 }), // Made optional
  body('prix_nuit').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    return !isNaN(parseFloat(value)) && parseFloat(value) >= 0;
  }),
  body('etage').optional().isInt({ min: 0, max: 50 }), // Made optional
  body('surface').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    return !isNaN(parseFloat(value)) && parseFloat(value) >= 0;
  }),
  body('acoustique').optional().isBoolean(),
  body('cuisine_equipee').optional().isBoolean(),
  body('terrasse').optional().isBoolean(),
  body('douches').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    return !isNaN(parseInt(value)) && parseInt(value) >= 0;
  }),
  body('vestiaires').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    return !isNaN(parseInt(value)) && parseInt(value) >= 0;
  }),
  body('places').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    return !isNaN(parseInt(value)) && parseInt(value) >= 0;
  }),
  body('couvert').optional().isBoolean(),
  body('profondeur_max').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    return !isNaN(parseFloat(value)) && parseFloat(value) >= 0;
  }),
  body('chauffage').optional().isBoolean(),
  body('superficie').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    return !isNaN(parseFloat(value)) && parseFloat(value) >= 0;
  }),
  body('arrosage_automatique').optional().isBoolean(),
  body('hauteur_plafond').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    return !isNaN(parseFloat(value)) && parseFloat(value) >= 0;
  }),
  body('quai_chargement').optional().isBoolean(),
  body('description').optional().isLength({ max: 1000 }),
  body('notes').optional().isLength({ max: 1000 })
], async (req, res) => {
  try {
    // Debug logging
    console.log('Received data:', JSON.stringify(req.body, null, 2));
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Données de validation invalides',
        errors: errors.array()
      });
    }

    const chambreData = req.body;
    
    // Check if room number already exists
    const existingChambre = await Chambre.findOne({ 
      where: { numero: chambreData.numero }
    });

    if (existingChambre) {
      return res.status(400).json({ 
        error: 'Room number already exists',
        message: 'Ce numéro de chambre existe déjà'
      });
    }

    const chambre = await Chambre.create(chambreData);

    res.status(201).json({
      message: 'Chambre créée avec succès',
      chambre
    });

  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ 
      error: 'Failed to create room',
      message: 'Erreur lors de la création de la chambre'
    });
  }
});

// PUT /api/chambres/:id - Update room (temporarily allowing all authenticated users for testing)
router.put('/:id', [
  requireRole('Superviseur', 'Administrateur', 'Patron'),
  body('numero').optional().isLength({ min: 1, max: 20 }),
  body('type').optional().isIn(['Chambre', 'Bureau administratif', 'Salle de fête', 'Salle de réunion', 'Restaurant', 'Bar', 'Spa', 'Gym', 'Parking', 'Piscine', 'Jardin', 'Terrasse', 'Cuisine', 'Entrepôt', 'Autre']),
  body('categorie').optional().isIn(['Standard', 'Confort', 'Premium', 'Suite', 'Familiale', 'Accessible']),
  body('statut').optional().isIn(['Libre', 'Occupé', 'En nettoyage', 'En maintenance', 'Réservé', 'Fermé', 'Service en cours', 'En cours d\'utilisation', 'Plein', 'Fermeture saisonnière', 'En entretien', 'En inventaire']),
  body('prix_nuit').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    return !isNaN(parseFloat(value)) && parseFloat(value) >= 0;
  }),
  body('etage').optional().isInt({ min: 0, max: 50 }),
  body('capacite').optional().isInt({ min: 1, max: 100 }),
  body('surface').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    return !isNaN(parseFloat(value)) && parseFloat(value) >= 0;
  }),
  body('acoustique').optional().isBoolean(),
  body('cuisine_equipee').optional().isBoolean(),
  body('terrasse').optional().isBoolean(),
  body('douches').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    return !isNaN(parseInt(value)) && parseInt(value) >= 0;
  }),
  body('vestiaires').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    return !isNaN(parseInt(value)) && parseInt(value) >= 0;
  }),
  body('places').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    return !isNaN(parseInt(value)) && parseInt(value) >= 0;
  }),
  body('couvert').optional().isBoolean(),
  body('profondeur_max').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    return !isNaN(parseFloat(value)) && parseFloat(value) >= 0;
  }),
  body('chauffage').optional().isBoolean(),
  body('superficie').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    return !isNaN(parseFloat(value)) && parseFloat(value) >= 0;
  }),
  body('arrosage_automatique').optional().isBoolean(),
  body('hauteur_plafond').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    return !isNaN(parseFloat(value)) && parseFloat(value) >= 0;
  }),
  body('quai_chargement').optional().isBoolean(),
  body('description').optional().isLength({ max: 1000 }),
  body('notes').optional().isLength({ max: 1000 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Données de validation invalides',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const chambreData = req.body;

    const chambre = await Chambre.findByPk(id);

    if (!chambre) {
      return res.status(404).json({ 
        error: 'Room not found',
        message: 'Chambre non trouvée'
      });
    }

    // Check if new room number conflicts with existing room
    if (chambreData.numero && chambreData.numero !== chambre.numero) {
      const existingChambre = await Chambre.findOne({ 
        where: { numero: chambreData.numero }
      });

      if (existingChambre) {
        return res.status(400).json({ 
          error: 'Room number already exists',
          message: 'Ce numéro de chambre existe déjà'
        });
      }
    }

    await chambre.update(chambreData);

    res.json({
      message: 'Chambre mise à jour avec succès',
      chambre
    });

  } catch (error) {
    console.error('Update room error:', error);
    res.status(500).json({ 
      error: 'Failed to update room',
      message: 'Erreur lors de la mise à jour de la chambre'
    });
  }
});

// DELETE /api/chambres/:id - Delete room (temporarily allowing all authenticated users for testing)
router.delete('/:id', [
  requireRole('Administrateur', 'Patron'),
], async (req, res) => {
  try {
    const { id } = req.params;
    const chambre = await Chambre.findByPk(id);

    if (!chambre) {
      return res.status(404).json({ 
        error: 'Room not found',
        message: 'Chambre non trouvée'
      });
    }

    await chambre.destroy();

    res.json({
      message: 'Chambre supprimée avec succès'
    });

  } catch (error) {
    console.error('Delete room error:', error);
    res.status(500).json({ 
      error: 'Failed to delete room',
      message: 'Erreur lors de la suppression de la chambre'
    });
  }
});

// GET /api/chambres/stats/overview - Get room statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const { Op } = require('sequelize');
    
    // Basic counts
    const totalRooms = await Chambre.count();
    const availableRooms = await Chambre.count({ where: { statut: 'Libre' } });
    const occupiedRooms = await Chambre.count({ where: { statut: 'Occupée' } });
    const maintenanceRooms = await Chambre.count({ where: { statut: 'En maintenance' } });
    const cleaningRooms = await Chambre.count({ where: { statut: 'En nettoyage' } });
    const reservedRooms = await Chambre.count({ where: { statut: 'Réservée' } });

    // Revenue calculations
    const totalRevenue = await Chambre.sum('prix_nuit', { 
      where: { statut: 'Occupée' } 
    });

    // Room types distribution
    const roomTypes = await Chambre.findAll({
      attributes: [
        'type',
        [Chambre.sequelize.fn('COUNT', Chambre.sequelize.col('id')), 'count'],
        [Chambre.sequelize.fn('AVG', Chambre.sequelize.col('prix_nuit')), 'avgPrice']
      ],
      group: ['type']
    });

    // Status distribution
    const statusDistribution = await Chambre.findAll({
      attributes: [
        'statut',
        [Chambre.sequelize.fn('COUNT', Chambre.sequelize.col('id')), 'count']
      ],
      group: ['statut']
    });

    // Floor distribution
    const floorDistribution = await Chambre.findAll({
      attributes: [
        'etage',
        [Chambre.sequelize.fn('COUNT', Chambre.sequelize.col('id')), 'count']
      ],
      group: ['etage'],
      order: [['etage', 'ASC']]
    });

    // Occupancy rate calculation
    const occupancyRate = totalRooms > 0 ? ((occupiedRooms / totalRooms) * 100).toFixed(2) : 0;
    const cleaningRate = totalRooms > 0 ? ((cleaningRooms / totalRooms) * 100).toFixed(2) : 0;
    const maintenanceRate = totalRooms > 0 ? ((maintenanceRooms / totalRooms) * 100).toFixed(2) : 0;

    res.json({
      stats: {
        total: totalRooms,
        available: availableRooms,
        occupied: occupiedRooms,
        maintenance: maintenanceRooms,
        cleaning: cleaningRooms,
        reserved: reservedRooms,
        occupancyRate: parseFloat(occupancyRate),
        cleaningRate: parseFloat(cleaningRate),
        maintenanceRate: parseFloat(maintenanceRate),
        totalRevenue: totalRevenue || 0,
        avgPrice: totalRooms > 0 ? (await Chambre.sum('prix_nuit') / totalRooms).toFixed(2) : 0
      },
      roomTypes,
      statusDistribution,
      floorDistribution
    });

  } catch (error) {
    console.error('Get room stats error:', error);
    res.status(500).json({ 
      error: 'Failed to get room statistics',
      message: 'Erreur lors de la récupération des statistiques'
    });
  }
});

// GET /api/chambres/:id/history - Get room history
router.get('/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const { Op } = require('sequelize');

    // Vérifier que la chambre existe
    const chambre = await Chambre.findByPk(id);
    if (!chambre) {
      return res.status(404).json({ 
        error: 'Room not found',
        message: 'Chambre non trouvée'
      });
    }

    // Récupérer l'historique des affectations
    const affectations = await AffectationChambre.findAll({
      where: { chambre_id: id },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'prenom', 'nom', 'email']
        }
      ],
      order: [['date_affectation', 'DESC']],
      limit: 50
    });

    // Récupérer l'historique des problématiques
    const problematiques = await Problematique.findAll({
      where: { chambre_id: id },
      include: [
        {
          model: User,
          as: 'assigne',
          attributes: ['id', 'prenom', 'nom']
        }
      ],
      order: [['date_creation', 'DESC']],
      limit: 20
    });

    // Récupérer l'historique des tâches liées
    const taches = await Tache.findAll({
      where: { chambre_id: id },
      include: [
        {
          model: User,
          as: 'assigne',
          attributes: ['id', 'prenom', 'nom']
        }
      ],
      order: [['date_creation', 'DESC']],
      limit: 20
    });

    // Combiner et formater l'historique
    const history = [];

    // Ajouter les affectations
    affectations.forEach(affectation => {
      history.push({
        type: 'checkin',
        title: `Arrivée client - ${affectation.user?.prenom} ${affectation.user?.nom}`,
        description: `Client affecté à la chambre ${chambre.nom}`,
        timestamp: affectation.date_affectation,
        user: affectation.user,
        details: {
          date_arrivee: affectation.date_arrivee,
          date_depart: affectation.date_depart,
          nombre_personnes: affectation.nombre_personnes
        }
      });
    });

    // Ajouter les problématiques
    problematiques.forEach(problematique => {
      history.push({
        type: 'issue',
        title: `Problématique - ${problematique.titre}`,
        description: problematique.description,
        timestamp: problematique.date_creation,
        user: problematique.assigne,
        details: {
          statut: problematique.statut,
          priorite: problematique.priorite,
          type: problematique.type
        }
      });
    });

    // Ajouter les tâches
    taches.forEach(tache => {
      history.push({
        type: tache.type === 'Nettoyage' ? 'cleaning' : 'maintenance',
        title: `Tâche - ${tache.titre}`,
        description: tache.description,
        timestamp: tache.date_creation,
        user: tache.assigne,
        details: {
          statut: tache.statut,
          priorite: tache.priorite,
          date_limite: tache.date_limite
        }
      });
    });

    // Trier par date (plus récent en premier)
    history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      history: history.slice(0, 100) // Limiter à 100 entrées
    });

  } catch (error) {
    console.error('Get room history error:', error);
    res.status(500).json({ 
      error: 'Failed to get room history',
      message: 'Erreur lors de la récupération de l\'historique'
    });
  }
});

// GET /api/chambres/:id/articles - Get articles assigned to a specific space
router.get('/:id/articles', async (req, res) => {
  try {
    const { id } = req.params;
    const { Op } = require('sequelize');

    // First check if the space exists
    const chambre = await Chambre.findByPk(id);
    if (!chambre) {
      return res.status(404).json({ 
        error: 'Space not found',
        message: 'Espace non trouvé' 
      });
    }

    // Get stock movements related to this space
    const MouvementStock = require('../models/MouvementStock');
    const Inventaire = require('../models/Inventaire');
    const User = require('../models/User');
    
    // Get approved assignment requests for this space
    const DemandeAffectation = require('../models/DemandeAffectation');
    const DemandeAffectationLigne = require('../models/DemandeAffectationLigne');

    // Get stock movements
    const mouvements = await MouvementStock.findAll({
      where: {
        chambre_id: id,
        statut: 'Validé'
      },
      include: [
        {
          model: Inventaire,
          as: 'inventaire',
          attributes: ['id', 'nom', 'categorie', 'code_produit', 'unite', 'prix_unitaire']
        },
        {
          model: User,
          as: 'utilisateur',
          attributes: ['id', 'nom', 'prenom']
        }
      ],
      order: [['date_mouvement', 'DESC']]
    });

    // Get approved assignment requests for this space
    const demandesApprouvees = await DemandeAffectation.findAll({
      where: {
        statut: 'approuvee'
      },
      include: [
        {
          model: DemandeAffectationLigne,
          as: 'lignes',
          where: {
            chambre_id: id
          },
          include: [
            {
              model: Inventaire,
              as: 'inventaire',
              attributes: ['id', 'nom', 'categorie', 'code_produit', 'unite', 'prix_unitaire']
            }
          ]
        }
      ]
    });

    // Calculate current stock for each article in this space
    const articlesMap = new Map();

    // First, add articles from approved requests
    demandesApprouvees.forEach(demande => {
      demande.lignes.forEach(ligne => {
        const articleId = ligne.inventaire_id;
        const article = ligne.inventaire;
        
        if (!articlesMap.has(articleId)) {
          articlesMap.set(articleId, {
            id: articleId,
            nom: article.nom,
            categorie: article.categorie,
            code_produit: article.code_produit,
            unite: article.unite,
            prix_unitaire: article.prix_unitaire,
            quantite_actuelle: 0,
            quantite_approvee: 0,
            mouvements: []
          });
        }
        
        const articleData = articlesMap.get(articleId);
        articleData.quantite_approvee += ligne.quantite_approvee || 0;
      });
    });

    // Then add stock movements
    mouvements.forEach(mouvement => {
      const articleId = mouvement.inventaire_id;
      const article = mouvement.inventaire;
      
      if (!articlesMap.has(articleId)) {
        articlesMap.set(articleId, {
          id: articleId,
          nom: article.nom,
          categorie: article.categorie,
          code_produit: article.code_produit,
          unite: article.unite,
          prix_unitaire: article.prix_unitaire,
          quantite_actuelle: 0,
          quantite_approvee: 0,
          mouvements: []
        });
      }

      const articleData = articlesMap.get(articleId);
      
      // Add movement to article history
      articleData.mouvements.push({
        id: mouvement.id,
        type_mouvement: mouvement.type_mouvement,
        quantite: mouvement.quantite,
        date_mouvement: mouvement.date_mouvement,
        motif: mouvement.motif,
        utilisateur: mouvement.utilisateur
      });
    });

    // For assignment requests, the current quantity is the approved quantity
    articlesMap.forEach((articleData, articleId) => {
      // The current quantity in a room is the approved quantity from assignment requests
      // This represents what is actually available/assigned to this space
      articleData.quantite_actuelle = articleData.quantite_approvee || 0;
    });

    // Convert map to array - show ALL articles assigned to this space
    const articles = Array.from(articlesMap.values())
      .map(article => ({
        ...article,
        // The current quantity is now the approved quantity (what's assigned to this space)
        quantite_actuelle: article.quantite_actuelle
      }));

    res.json({
      success: true,
      espace: {
        id: chambre.id,
        numero: chambre.numero,
        type: chambre.type,
        etage: chambre.etage
      },
      articles,
      total_articles: articles.length
    });

  } catch (error) {
    console.error('Error fetching space articles:', error);
    res.status(500).json({ 
      error: 'Failed to fetch space articles',
      message: 'Erreur lors de la récupération des articles de l\'espace'
    });
  }
});

module.exports = router; 
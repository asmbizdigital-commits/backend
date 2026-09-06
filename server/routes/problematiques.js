const express = require('express');
const { body, validationResult, query } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');
const Problematique = require('../models/Problematique');
const ProblematiqueImage = require('../models/ProblematiqueImage');
const User = require('../models/User');
const Chambre = require('../models/Chambre');
const Departement = require('../models/Departement');
const SousDepartement = require('../models/SousDepartement');
const Tache = require('../models/Tache');
const { authenticateToken, requireRole } = require('../middleware/auth');
const CloudinaryImageService = require('../services/cloudinaryImageService');
const pushNotificationService = require('../services/pushNotificationService');
const imageService = new CloudinaryImageService();

const router = express.Router();

// Configure multer for file uploads - Utilisation de la mémoire pour avoir accès au buffer
const upload = multer({
  storage: multer.memoryStorage(), // Utilise la mémoire pour avoir file.buffer
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    // Seulement les images
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = file.mimetype && file.mimetype.startsWith('image/');
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Type de fichier non supporté - Seules les images sont autorisées'));
    }
  }
});

// Apply authentication to all routes
router.use(authenticateToken);

// Test endpoint pour diagnostiquer le service d'images
router.get('/test-images', async (req, res) => {
  try {
    // Test du service d'images Cloudinary
    console.log('🔍 Test du service d\'images Cloudinary...');
    console.log('📋 Modèle importé:', typeof ProblematiqueImage);
    console.log('📋 Méthodes disponibles:', Object.getOwnPropertyNames(ProblematiqueImage));
    
    res.json({
      message: 'Service d\'images Cloudinary fonctionnel',
      maxFileSize: imageService.maxFileSize,
      allowedMimeTypes: imageService.allowedMimeTypes,
      modelInfo: {
        type: typeof ProblematiqueImage,
        methods: Object.getOwnPropertyNames(ProblematiqueImage)
      }
    });
  } catch (error) {
    console.error('Test images error:', error);
    res.status(500).json({
      error: 'Service d\'images non fonctionnel',
      message: error.message
    });
  }
});

// Test endpoint pour créer directement une image en base
router.post('/test-create-image', async (req, res) => {
  try {
    console.log('🧪 Test de création directe d\'image en base...');
    
    const testImageData = {
      problematique_id: 12, // Utiliser la problématique de test
      nom_fichier: 'test_direct.png',
      nom_original: 'test_direct.png',
      chemin_fichier: '/uploads/problematiques/test_direct.png',
      type_mime: 'image/png',
      taille: 1000,
      source: 'upload', // Utiliser une valeur valide de l'ENUM
      utilisateur_id: 4,
      statut: 'actif',
      metadata: JSON.stringify({ format: 'png', width: 100, height: 100 })
    };
    
    console.log('📋 Données de test:', testImageData);
    
    const image = await ProblematiqueImage.create(testImageData);
    console.log('✅ Image créée en base avec succès:', image.id);
    
    res.json({
      message: 'Test de création d\'image réussi',
      image: image
    });
    
  } catch (error) {
    console.error('❌ Erreur lors du test de création:', error);
    res.status(500).json({
      error: 'Test de création échoué',
      message: error.message,
      stack: error.stack
    });
  }
});

// Test endpoint pour vérifier multer et l'upload de fichiers
router.post('/test-upload', upload.array('fichiers', 5), async (req, res) => {
  try {
    console.log('🧪 Test d\'upload de fichiers...');
    console.log('🔍 req.files =', req.files);
    console.log('🔍 typeof req.files =', typeof req.files);
    console.log('🔍 Array.isArray(req.files) =', Array.isArray(req.files));
    
    if (req.files && req.files.length > 0) {
      console.log('📁 Fichiers reçus:', req.files.length);
      console.log('📋 Détails des fichiers:', req.files.map(f => ({
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
        buffer: f.buffer ? 'Présent' : 'Manquant'
      })));
      
      // Service Cloudinary ne nécessite pas d'initialisation de dossiers
      
      const uploadedImages = [];
      for (const file of req.files) {
        try {
          console.log(`🔄 Test du traitement de l'image: ${file.originalname}`);
          
          const imageData = await imageService.processAndSaveImage(
            file, 
            999, // ID de test
            4,   // User ID de test
            'upload'
          );
          
          console.log('✅ Image traitée avec succès:', imageData);
          uploadedImages.push(imageData);
          
        } catch (error) {
          console.error(`❌ Erreur lors du traitement de l'image ${file.originalname}:`, error);
        }
      }
      
      res.json({
        message: 'Test d\'upload réussi',
        filesReceived: req.files.length,
        filesProcessed: uploadedImages.length,
        uploadedImages: uploadedImages
      });
      
    } else {
      console.log('❌ Aucun fichier reçu');
      res.json({
        message: 'Aucun fichier reçu',
        filesReceived: 0
      });
    }
    
  } catch (error) {
    console.error('❌ Erreur lors du test d\'upload:', error);
    res.status(500).json({
      error: 'Test d\'upload échoué',
      message: error.message
    });
  }
});

// GET /api/problematiques - Get all issues with filtering
router.get('/', async (req, res) => {
  try {

    const { statut, priorite, type, chambre_id, assigne_id, page = 1, limit = 20, search } = req.query;
    
    // Validate and sanitize parameters
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (pageNum - 1) * limitNum;

    // Build where clause
    const whereClause = {};
    
    // Validate statut
    const validStatuts = ['Ouverte', 'En cours', 'En attente', 'Résolue', 'Fermée'];
    if (statut && statut.trim() !== '' && validStatuts.includes(statut.trim())) {
      whereClause.statut = statut.trim();
    }
    
    // Validate priorite
    const validPriorites = ['Basse', 'Normale', 'Haute', 'Urgente'];
    if (priorite && priorite.trim() !== '' && validPriorites.includes(priorite.trim())) {
      whereClause.priorite = priorite.trim();
    }
    
    // Validate type
    const validTypes = ['Maintenance', 'Nettoyage', 'Sécurité', 'Technique', 'Autre'];
    if (type && type.trim() !== '' && validTypes.includes(type.trim())) {
      whereClause.type = type.trim();
    }
    
    // Validate chambre_id
    if (chambre_id && chambre_id.trim() !== '') {
      const chambreId = parseInt(chambre_id);
      if (!isNaN(chambreId)) {
        whereClause.chambre_id = chambreId;
      }
    }
    
    // Validate assigne_id
    if (assigne_id && assigne_id.trim() !== '') {
      const assigneId = parseInt(assigne_id);
      if (!isNaN(assigneId)) {
        whereClause.assigne_id = assigneId;
      }
    }
    
    // Add search functionality
    if (search && search.trim() !== '') {
      whereClause[Op.or] = [
        { titre: { [Op.like]: `%${search.trim()}%` } },
        { description: { [Op.like]: `%${search.trim()}%` } }
      ];
    }

    const { count, rows: problematiques } = await Problematique.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'rapporteur',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: User,
          as: 'assigne',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: Chambre,
          as: 'chambre',
          attributes: ['id', 'numero', 'type']
        },
        {
          model: Departement,
          as: 'departement',
          attributes: ['id', 'nom', 'responsable_id']
        },
        {
          model: SousDepartement,
          as: 'sous_departement',
          attributes: ['id', 'nom', 'departement_id']
        }
      ],
      limit: limitNum,
      offset: offset,
      order: [['date_creation', 'DESC']]
    });

    // Parse fichiers JSON for each problematique
    const problematiquesWithParsedFiles = problematiques.map(problematique => {
      const data = problematique.toJSON();
      if (data.fichiers) {
        try {
          data.fichiers = JSON.parse(data.fichiers);
        } catch (error) {
          console.error('Error parsing fichiers JSON:', error);
          data.fichiers = [];
        }
      } else {
        data.fichiers = [];
      }
      return data;
    });

    res.json({
      problematiques: problematiquesWithParsedFiles,
      totalItems: count,
      totalPages: Math.ceil(count / limitNum),
      currentPage: pageNum,
      limit: limitNum
    });

  } catch (error) {
    console.error('Get issues error:', error);
    res.status(500).json({ 
      error: 'Failed to get issues',
      message: 'Erreur lors de la récupération des problématiques'
    });
  }
});

// GET /api/problematiques/:id - Get specific issue
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const problematique = await Problematique.findByPk(id, {
      include: [
        {
          model: User,
          as: 'rapporteur',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: User,
          as: 'assigne',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: Chambre,
          as: 'chambre',
          attributes: ['id', 'numero', 'type']
        },
        {
          model: Departement,
          as: 'departement',
          attributes: ['id', 'nom', 'responsable_id']
        },
        {
          model: SousDepartement,
          as: 'sous_departement',
          attributes: ['id', 'nom', 'departement_id']
        }
      ]
    });

    if (!problematique) {
      return res.status(404).json({ 
        error: 'Issue not found',
        message: 'Problématique non trouvée'
      });
    }

    // Parse fichiers JSON
    const data = problematique.toJSON();
    if (data.fichiers) {
      try {
        data.fichiers = JSON.parse(data.fichiers);
      } catch (error) {
        console.error('Error parsing fichiers JSON:', error);
        data.fichiers = [];
      }
    } else {
      data.fichiers = [];
    }

    res.json({ problematique: data });

  } catch (error) {
    console.error('Get issue error:', error);
    res.status(500).json({ 
      error: 'Failed to get issue',
      message: 'Erreur lors de la récupération de la problématique'
    });
  }
});

// POST /api/problematiques - Create new issue with file upload (unified for React and Flutter)
router.post('/', [
  upload.array('fichiers', 5), // Max 5 files
  body('titre').isLength({ min: 3, max: 255 }),
  body('description').isLength({ min: 1 }),
  body('type').isIn(['Maintenance', 'Nettoyage', 'Sécurité', 'Technique', 'Restaurant', 'Banquets', 'Reception', 'Autre']),
  body('priorite').isIn(['Basse', 'Normale', 'Haute', 'Urgente']),
  body('statut').isIn(['Ouverte', 'En cours', 'En attente', 'Résolue', 'Fermée']),
  body('chambre_id').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) return true;
    return !isNaN(parseInt(value));
  }),
  body('assigne_id').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) return true;
    return !isNaN(parseInt(value));
  }),
  body('date_limite').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) return true;
    return !isNaN(Date.parse(value));
  }),
  body('tags').optional().isString(),
  body('commentaires').optional().isString(),
  body('departement_id').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) return true;
    return !isNaN(parseInt(value));
  }),
  body('sous_departement_id').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) return true;
    return !isNaN(parseInt(value));
  })
], async (req, res) => {
  try {
    console.log('🚀 Début de la création de problématique');
    console.log('📋 Corps de la requête:', req.body);
    console.log('📁 Fichiers reçus:', req.files);
    console.log('🔐 Utilisateur:', req.user);
    
    // Nettoyer d'abord les données (gérer les tableaux)
    const problematiqueData = {
      ...req.body,
      rapporteur_id: req.user.id
    };
    
    console.log('📊 Données de la problématique:', problematiqueData);
    console.log('🔍 Type:', problematiqueData.type, 'Priorité:', problematiqueData.priorite);
    
    // Clean up empty values and handle arrays
    if (problematiqueData.chambre_id === '' || problematiqueData.chambre_id === null) {
      delete problematiqueData.chambre_id;
    } else if (Array.isArray(problematiqueData.chambre_id)) {
      problematiqueData.chambre_id = parseInt(problematiqueData.chambre_id[0]);
    } else if (problematiqueData.chambre_id) {
      problematiqueData.chambre_id = parseInt(problematiqueData.chambre_id);
    }

    if (problematiqueData.assigne_id === '' || problematiqueData.assigne_id === null) {
      delete problematiqueData.assigne_id;
    } else if (Array.isArray(problematiqueData.assigne_id)) {
      problematiqueData.assigne_id = parseInt(problematiqueData.assigne_id[0]);
    } else if (problematiqueData.assigne_id) {
      problematiqueData.assigne_id = parseInt(problematiqueData.assigne_id);
    }

    if (problematiqueData.date_limite === '' || problematiqueData.date_limite === null) {
      delete problematiqueData.date_limite;
    } else if (Array.isArray(problematiqueData.date_limite)) {
      problematiqueData.date_limite = problematiqueData.date_limite[0];
    }

    if (problematiqueData.tags === '' || problematiqueData.tags === null) {
      delete problematiqueData.tags;
    } else if (Array.isArray(problematiqueData.tags)) {
      problematiqueData.tags = problematiqueData.tags[0];
    }

    if (problematiqueData.commentaires === '' || problematiqueData.commentaires === null) {
      delete problematiqueData.commentaires;
    } else if (Array.isArray(problematiqueData.commentaires)) {
      problematiqueData.commentaires = problematiqueData.commentaires[0];
    }

    // Normaliser departement_id & sous_departement_id
    if (problematiqueData.departement_id === '' || problematiqueData.departement_id === null) {
      delete problematiqueData.departement_id;
    } else if (Array.isArray(problematiqueData.departement_id)) {
      problematiqueData.departement_id = parseInt(problematiqueData.departement_id[0]);
    } else if (problematiqueData.departement_id) {
      problematiqueData.departement_id = parseInt(problematiqueData.departement_id);
    }

    if (problematiqueData.sous_departement_id === '' || problematiqueData.sous_departement_id === null) {
      delete problematiqueData.sous_departement_id;
    } else if (Array.isArray(problematiqueData.sous_departement_id)) {
      problematiqueData.sous_departement_id = parseInt(problematiqueData.sous_departement_id[0]);
    } else if (problematiqueData.sous_departement_id) {
      problematiqueData.sous_departement_id = parseInt(problematiqueData.sous_departement_id);
    }
    
    // Supprimer le champ fichiers car les images sont gérées séparément
    if (problematiqueData.fichiers) {
      delete problematiqueData.fichiers;
    }
    
    console.log('🧹 Données nettoyées:', problematiqueData);
    
    // Maintenant valider les données nettoyées
    console.log('🔍 Validation des données nettoyées...');
    
    // Créer un objet de validation personnalisé
    const validationData = {
      titre: problematiqueData.titre,
      description: problematiqueData.description,
      type: problematiqueData.type,
      priorite: problematiqueData.priorite,
      statut: problematiqueData.statut,
      chambre_id: problematiqueData.chambre_id,
      assigne_id: problematiqueData.assigne_id,
      date_limite: problematiqueData.date_limite,
      tags: problematiqueData.tags,
      commentaires: problematiqueData.commentaires,
      departement_id: problematiqueData.departement_id,
      sous_departement_id: problematiqueData.sous_departement_id
    };
    
    console.log('📋 Données pour validation:', validationData);
    
    // Validation manuelle des champs requis
    const validationErrors = [];
    
    if (!validationData.titre || validationData.titre.length < 3 || validationData.titre.length > 255) {
      validationErrors.push({
        type: 'field',
        value: validationData.titre,
        msg: 'Le titre doit contenir entre 3 et 255 caractères',
        path: 'titre',
        location: 'body'
      });
    }
    
    if (!validationData.description || validationData.description.length < 1) {
      validationErrors.push({
        type: 'field',
        value: validationData.description,
        msg: 'La description est requise',
        path: 'description',
        location: 'body'
      });
    }
    
    if (!['Maintenance', 'Nettoyage', 'Sécurité', 'Technique', 'Restaurant', 'Banquets', 'Reception', 'Autre'].includes(validationData.type)) {
      validationErrors.push({
        type: 'field',
        value: validationData.type,
        msg: 'Type de problématique invalide',
        path: 'type',
        location: 'body'
      });
    }
    
    if (!['Basse', 'Normale', 'Haute', 'Urgente'].includes(validationData.priorite)) {
      validationErrors.push({
        type: 'field',
        value: validationData.priorite,
        msg: 'Priorité invalide',
        path: 'priorite',
        location: 'body'
      });
    }
    
    if (!['Ouverte', 'En cours', 'En attente', 'Résolue', 'Fermée'].includes(validationData.statut)) {
      validationErrors.push({
        type: 'field',
        value: validationData.statut,
        msg: 'Statut invalide',
        path: 'statut',
        location: 'body'
      });
    }
    
    if (validationErrors.length > 0) {
      console.log('❌ Erreurs de validation:', validationErrors);
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Données de validation invalides',
        errors: validationErrors
      });
    }
    
    console.log('✅ Validation réussie');

    // Service Cloudinary ne nécessite pas d'initialisation de dossiers

    // Créer la problématique d'abord
    const problematique = await Problematique.create(problematiqueData);

    // Traiter les images uploadées ou les URLs Cloudinary
    console.log('🔍 DEBUG: req.files =', req.files);
    console.log('🔍 DEBUG: typeof req.files =', typeof req.files);
    console.log('🔍 DEBUG: Array.isArray(req.files) =', Array.isArray(req.files));
    console.log('🔍 DEBUG: pieces_jointes =', req.body.pieces_jointes);
    
    const uploadedImages = [];
    
    // Cas 1: Fichiers uploadés (React)
    if (req.files && req.files.length > 0) {
      console.log('🖼️ Début du traitement des images uploadées');
      console.log('📁 Nombre de fichiers reçus:', req.files.length);
      console.log('📋 Détails des fichiers:', req.files.map(f => ({
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
        buffer: f.buffer ? 'Présent' : 'Manquant'
      })));

      for (const file of req.files) {
        try {
          console.log(`🔄 Traitement de l'image: ${file.originalname}`);
          
          // Traiter et sauvegarder l'image
          const imageData = await imageService.processAndSaveImage(
            file, 
            problematique.id, 
            req.user.id, 
            'upload'
          );

          console.log('✅ Image traitée, données reçues:', imageData);

          // Ajouter l'ID de la problématique aux données de l'image
          imageData.problematique_id = problematique.id;
          console.log('🆔 ID de la problématique ajouté:', imageData.problematique_id);

          // Sauvegarder les informations de l'image en base
          console.log('💾 Sauvegarde en base de données...');
          console.log('📋 Données finales pour la base:', imageData);
          const image = await ProblematiqueImage.create(imageData);
          console.log('✅ Image sauvegardée en base, ID:', image.id);
          uploadedImages.push(image);

        } catch (error) {
          console.error(`❌ Erreur lors du traitement de l'image ${file.originalname}:`, error);
          console.error('📚 Stack trace:', error.stack);
          // Continuer avec les autres images
        }
      }

      // Mettre à jour le nombre d'images
      await problematique.update({
        nombre_images: uploadedImages.length,
        image_principale: uploadedImages.length > 0 ? uploadedImages[0].chemin_fichier : null // URL Cloudinary directe
      });

      // Ajouter les images à la réponse
      problematique.dataValues.images = uploadedImages;
    }
    
    // Cas 2: URLs Cloudinary (Flutter)
    else if (req.body.pieces_jointes && Array.isArray(req.body.pieces_jointes) && req.body.pieces_jointes.length > 0) {
      console.log('☁️ Début du traitement des URLs Cloudinary');
      console.log('📁 Nombre d\'URLs reçues:', req.body.pieces_jointes.length);
      console.log('📋 Détails des URLs:', req.body.pieces_jointes);

      for (const pieceJointe of req.body.pieces_jointes) {
        try {
          console.log(`🔄 Traitement de l'URL: ${pieceJointe.url}`);
          
          // Extraire le nom de fichier de l'URL
          const urlParts = pieceJointe.url.split('/');
          const filename = urlParts[urlParts.length - 1];
          const nameWithoutExt = filename.split('.')[0];
          
          // Créer les données de l'image pour la base
          const imageData = {
            problematique_id: problematique.id,
            nom_fichier: filename,
            nom_original: pieceJointe.nom || filename,
            chemin_fichier: pieceJointe.url,
            type_mime: pieceJointe.type || 'image/jpeg',
            taille: 0, // Taille inconnue pour les URLs
            source: 'upload',
            utilisateur_id: req.user.id,
            statut: 'actif',
            public_id: nameWithoutExt,
            cloudinary_data: {
              public_id: nameWithoutExt,
              secure_url: pieceJointe.url,
              url: pieceJointe.url
            }
          };

          console.log('✅ Données de l\'image préparées:', imageData);

          // Sauvegarder en base de données
          const image = await ProblematiqueImage.create(imageData);
          console.log('✅ Image sauvegardée en base, ID:', image.id);
          uploadedImages.push(image);

        } catch (error) {
          console.error(`❌ Erreur lors du traitement de l'URL ${pieceJointe.url}:`, error);
          console.error('📚 Stack trace:', error.stack);
          // Continuer avec les autres URLs
        }
      }

      // Mettre à jour le nombre d'images
      await problematique.update({
        nombre_images: uploadedImages.length,
        image_principale: uploadedImages.length > 0 ? uploadedImages[0].chemin_fichier : null
      });

      // Ajouter les images à la réponse
      problematique.dataValues.images = uploadedImages;
    }

    // Envoyer une notification push à tous les utilisateurs ayant l'application mobile connectée
    try {
      const notification = {
        title: '🚨 Nouvelle problématique créée',
        body: `${problematique.titre} - Priorité: ${problematique.priorite}`,
        type: 'problematique_created',
        problematiqueId: problematique.id,
        priority: problematique.priorite,
        data: {
          action: 'view_problematique',
          problematique_type: problematique.type,
          chambre_id: problematique.chambre_id?.toString() || '',
          departement_id: problematique.departement_id?.toString() || '',
          created_by: req.user.prenom + ' ' + req.user.nom
        }
      };

      const notificationResult = await pushNotificationService.sendNotificationToAll(notification);
      console.log(`📱 Notification push envoyée: ${notificationResult.successCount}/${notificationResult.totalTokens} appareils`);
    } catch (notificationError) {
      // Ne pas bloquer la création si l'envoi de notification échoue
      console.error('⚠️ Erreur lors de l\'envoi de la notification push:', notificationError);
    }

    res.status(201).json({
      message: 'Problématique créée avec succès',
      problematique,
      imagesUploaded: uploadedImages.length,
      imagesSource: req.files && req.files.length > 0 ? 'files' : 'urls'
    });

  } catch (error) {
    console.error('Create issue error:', error);
    res.status(500).json({ 
      error: 'Failed to create issue',
      message: 'Erreur lors de la création de la problématique'
    });
  }
});

// PUT /api/problematiques/:id - Update issue
router.put('/:id', [
  upload.array('fichiers', 5),
  body('titre').optional().isLength({ min: 3, max: 255 }),
  body('description').optional().isLength({ min: 1 }),
  body('type').optional().isIn(['Maintenance', 'Nettoyage', 'Sécurité', 'Technique', 'Autre']),
  body('priorite').optional().isIn(['Basse', 'Normale', 'Haute', 'Urgente']),
  body('statut').optional().isIn(['Ouverte', 'En cours', 'En attente', 'Résolue', 'Fermée']),
  body('chambre_id').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) return true;
    return !isNaN(parseInt(value));
  }),
  body('assigne_id').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) return true;
    return !isNaN(parseInt(value));
  }),
  body('date_limite').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) return true;
    return !isNaN(Date.parse(value));
  }),
  body('tags').optional().isString(),
  body('commentaires').optional().isString(),
  body('departement_id').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) return true;
    return !isNaN(parseInt(value));
  }),
  body('sous_departement_id').optional().custom((value) => {
    if (value === '' || value === null || value === undefined) return true;
    return !isNaN(parseInt(value));
  })
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
    const problematique = await Problematique.findByPk(id);

    if (!problematique) {
      return res.status(404).json({ 
        error: 'Issue not found',
        message: 'Problématique non trouvée'
      });
    }

    // Check permissions (only assignee, reporter, department manager, or higher roles can update)
    let canUpdate = false;
    
    // Check if user is assignee or reporter
    if (problematique.assigne_id === req.user.id || problematique.rapporteur_id === req.user.id) {
      canUpdate = true;
    }
    
    // Check if user has Superviseur permission
    if (req.user.hasPermission('Superviseur')) {
      canUpdate = true;
    }
    
    // Check if user is department manager
    if (problematique.departement_id) {
      const departement = await Departement.findByPk(problematique.departement_id);
      if (departement && departement.responsable_id === req.user.id) {
        canUpdate = true;
      }
    }
    
    if (!canUpdate) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: 'Permissions insuffisantes pour modifier cette problématique'
      });
    }

    const updateData = { ...req.body };

    // Clean up empty values
    if (updateData.chambre_id === '' || updateData.chambre_id === null) {
      delete updateData.chambre_id;
    } else if (updateData.chambre_id) {
      updateData.chambre_id = parseInt(updateData.chambre_id);
    }

    if (updateData.assigne_id === '' || updateData.assigne_id === null) {
      delete updateData.assigne_id;
    } else if (updateData.assigne_id) {
      updateData.assigne_id = parseInt(updateData.assigne_id);
    }

    if (updateData.date_limite === '' || updateData.date_limite === null) {
      delete updateData.date_limite;
    }

    if (updateData.tags === '' || updateData.tags === null) {
      delete updateData.tags;
    }

    if (updateData.commentaires === '' || updateData.commentaires === null) {
      delete updateData.commentaires;
    }

    // Normaliser departement_id & sous_departement_id
    if (updateData.departement_id === '' || updateData.departement_id === null) {
      delete updateData.departement_id;
    } else if (updateData.departement_id) {
      updateData.departement_id = parseInt(updateData.departement_id);
    }

    if (updateData.sous_departement_id === '' || updateData.sous_departement_id === null) {
      delete updateData.sous_departement_id;
    } else if (updateData.sous_departement_id) {
      updateData.sous_departement_id = parseInt(updateData.sous_departement_id);
    }

    // Handle new file uploads - convert to JSON string
    if (req.files && req.files.length > 0) {
      const newFiles = req.files.map(file => ({
        filename: file.filename,
        originalname: file.originalname,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype
      }));
      
      const existingFiles = problematique.fichiers ? JSON.parse(problematique.fichiers) : [];
      const allFiles = [...existingFiles, ...newFiles];
      updateData.fichiers = JSON.stringify(allFiles);
    }

    // Set resolution date if status is being set to resolved
    if (updateData.statut === 'Résolue' && problematique.statut !== 'Résolue') {
      updateData.date_resolution = new Date();
    }

    // Create automatic task when status changes to "En cours"
    if (updateData.statut === 'En cours' && problematique.statut !== 'En cours') {
      try {
        // Créer une nouvelle tâche basée sur la problématique
        const nouvelleTache = await Tache.create({
          titre: `Résoudre : ${problematique.titre}`,
          description: `Tâche automatiquement créée pour résoudre la problématique : ${problematique.description}`,
          priorite: problematique.priorite,
          statut: 'À faire',
          date_limite: updateData.date_limite || null,
          chambre_id: problematique.chambre_id,
          assigne_id: updateData.assigne_id || problematique.assigne_id,
          createur_id: problematique.rapporteur_id, // Utiliser rapporteur_id comme createur_id
          problematique_id: problematique.id, // Lier la tâche à la problématique
          type: 'Maintenance', // Type par défaut
          notes: `Créée automatiquement lors du passage au statut "En cours" de la problématique #${problematique.id}`
        });

        console.log(`✅ Tâche automatiquement créée pour la problématique #${problematique.id}:`, nouvelleTache.id);
      } catch (taskError) {
        console.error('❌ Erreur lors de la création automatique de la tâche:', taskError);
        // Ne pas bloquer la mise à jour de la problématique si la création de tâche échoue
      }
    }

    // Vérifier si l'assignation a changé
    const assignationChanged = updateData.assigne_id && updateData.assigne_id !== problematique.assigne_id;
    const previousAssignee = problematique.assigne_id;

    await problematique.update(updateData);

    // Envoyer notification si l'assignation a changé
    if (assignationChanged && updateData.assigne_id) {
      try {
        await pushNotificationService.notifyProblematiqueAssignment(updateData.assigne_id, problematique);
        console.log(`✅ Notification push envoyée pour l'assignation de la problématique #${problematique.id}`);
      } catch (notifError) {
        console.error('❌ Erreur notification push assignation:', notifError);
      }
    }

    // Envoyer notification de changement de statut si applicable
    if (updateData.statut && updateData.statut !== problematique.statut) {
      try {
        const targetUserId = updateData.assigne_id || previousAssignee;
        if (targetUserId) {
          await pushNotificationService.notifyStatusUpdate(targetUserId, problematique, updateData.statut, 'problematique');
          console.log(`✅ Notification push statut envoyée pour la problématique #${problematique.id}`);
        }
      } catch (notifError) {
        console.error('❌ Erreur notification push statut:', notifError);
      }
    }

    res.json({
      message: 'Problématique mise à jour avec succès',
      problematique
    });

  } catch (error) {
    console.error('Update issue error:', error);
    res.status(500).json({ 
      error: 'Failed to update issue',
      message: 'Erreur lors de la mise à jour de la problématique'
    });
  }
});

// POST /api/problematiques/:id/comment - Add comment to issue
router.post('/:id/comment', [
  body('comment').isLength({ min: 1, max: 1000 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Commentaire invalide',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { comment } = req.body;

    const problematique = await Problematique.findByPk(id);

    if (!problematique) {
      return res.status(404).json({ 
        error: 'Issue not found',
        message: 'Problématique non trouvée'
      });
    }

    await problematique.addComment(req.user.id, comment);

    res.json({
      message: 'Commentaire ajouté avec succès',
      problematique
    });

  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ 
      error: 'Failed to add comment',
      message: 'Erreur lors de l\'ajout du commentaire'
    });
  }
});

// DELETE /api/problematiques/:id - Delete issue (Administrateur and above)
router.delete('/:id', async (req, res) => {
  // Check if user has permission to delete problematiques
  if (!req.user.hasPermission('Administrateur')) {
    return res.status(403).json({ 
      error: 'Insufficient permissions',
      message: 'Permissions insuffisantes pour supprimer cette problématique'
    });
  }
  try {
    const { id } = req.params;
    const problematique = await Problematique.findByPk(id);

    if (!problematique) {
      return res.status(404).json({ 
        error: 'Issue not found',
        message: 'Problématique non trouvée'
      });
    }

    // Delete associated files from Cloudinary (if they exist)
    if (problematique.fichiers && problematique.fichiers.length > 0) {
      console.log('🗑️ Suppression des fichiers associés depuis Cloudinary...');
      // Note: Les fichiers sont maintenant sur Cloudinary, pas de suppression locale nécessaire
    }

    await problematique.destroy();

    res.json({
      message: 'Problématique supprimée avec succès'
    });

  } catch (error) {
    console.error('Delete issue error:', error);
    res.status(500).json({ 
      error: 'Failed to delete issue',
      message: 'Erreur lors de la suppression de la problématique'
    });
  }
});

// GET /api/problematiques/stats/overview - Get issue statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const { Op } = require('sequelize');
    
    // Basic counts
    const totalIssues = await Problematique.count();
    const openIssues = await Problematique.count({ where: { statut: 'Ouverte' } });
    const inProgressIssues = await Problematique.count({ where: { statut: 'En cours' } });
    const resolvedIssues = await Problematique.count({ where: { statut: 'Résolue' } });
    const urgentIssues = await Problematique.count({ where: { priorite: 'Urgente' } });
    const highPriorityIssues = await Problematique.count({ where: { priorite: 'Haute' } });
    const normalPriorityIssues = await Problematique.count({ where: { priorite: 'Normale' } });
    const lowPriorityIssues = await Problematique.count({ where: { priorite: 'Basse' } });

    // Recent issues (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentIssues = await Problematique.count({
      where: {
        date_creation: {
          [Op.gte]: sevenDaysAgo
        }
      }
    });

    // Issues by type with detailed stats
    const issuesByType = await Problematique.findAll({
      attributes: [
        'type',
        [Problematique.sequelize.fn('COUNT', Problematique.sequelize.col('id')), 'count']
      ],
      group: ['type']
    });

    // Get resolved issues by type separately
    const resolvedByType = await Problematique.findAll({
      attributes: [
        'type',
        [Problematique.sequelize.fn('COUNT', Problematique.sequelize.col('id')), 'count']
      ],
      where: { statut: 'Résolue' },
      group: ['type']
    });

    // Get urgent issues by type separately
    const urgentByType = await Problematique.findAll({
      attributes: [
        'type',
        [Problematique.sequelize.fn('COUNT', Problematique.sequelize.col('id')), 'count']
      ],
      where: { priorite: 'Urgente' },
      group: ['type']
    });

    // Issues by priority
    const issuesByPriority = await Problematique.findAll({
      attributes: [
        'priorite',
        [Problematique.sequelize.fn('COUNT', Problematique.sequelize.col('id')), 'count']
      ],
      group: ['priorite']
    });

    // Issues by status
    const issuesByStatus = await Problematique.findAll({
      attributes: [
        'statut',
        [Problematique.sequelize.fn('COUNT', Problematique.sequelize.col('id')), 'count']
      ],
      group: ['statut']
    });

    // Average resolution time (for resolved issues)
    const avgResolutionTime = await Problematique.findAll({
      attributes: [
        [Problematique.sequelize.fn('AVG', 
          Problematique.sequelize.literal('TIMESTAMPDIFF(HOUR, date_creation, date_resolution)')
        ), 'avgHours']
      ],
      where: {
        statut: 'Résolue',
        date_resolution: {
          [Op.ne]: null
        }
      }
    });

    // Resolution rate calculation
    const resolutionRate = totalIssues > 0 ? ((resolvedIssues / totalIssues) * 100).toFixed(2) : 0;
    const urgentRate = totalIssues > 0 ? ((urgentIssues / totalIssues) * 100).toFixed(2) : 0;

    res.json({
      stats: {
        total: totalIssues,
        open: openIssues,
        inProgress: inProgressIssues,
        resolved: resolvedIssues,
        urgent: urgentIssues,
        highPriority: highPriorityIssues,
        normalPriority: normalPriorityIssues,
        lowPriority: lowPriorityIssues,
        recent: recentIssues,
        resolutionRate: parseFloat(resolutionRate),
        urgentRate: parseFloat(urgentRate),
        avgResolutionTime: avgResolutionTime[0]?.dataValues?.avgHours || 0
      },
      issuesByType,
      resolvedByType,
      urgentByType,
      issuesByPriority,
      issuesByStatus
    });

  } catch (error) {
    console.error('Get issue stats error:', error);
    res.status(500).json({ 
      error: 'Failed to get issue statistics',
      message: 'Erreur lors de la récupération des statistiques'
    });
  }
});

// GET /api/problematiques/:id/images - Get images for a specific issue
router.get('/:id/images', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('🔍 Récupération des images pour la problématique:', id);
    
    // Vérifier que la problématique existe
    const problematique = await Problematique.findByPk(id);
    if (!problematique) {
      return res.status(404).json({
        error: 'Problématique non trouvée',
        message: 'La problématique demandée n\'existe pas'
      });
    }
    
    // Récupérer les images associées
    const images = await ProblematiqueImage.findAll({
      where: { problematique_id: id },
      order: [['date_upload', 'ASC']]
    });
    
    console.log('✅ Images trouvées:', images.length);
    
    res.json({
      message: 'Images récupérées avec succès',
      images: images
    });
    
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des images:', error);
    res.status(500).json({
      error: 'Failed to get images',
      message: 'Erreur lors de la récupération des images'
    });
  }
});

module.exports = router; 
const express = require('express');
const { body, validationResult, query } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');
const File = require('../models/File');
const Folder = require('../models/Folder');
const User = require('../models/User');
const Circuit = require('../models/Circuit');
const { authenticateToken } = require('../middleware/auth');
const CloudinaryImageService = require('../services/cloudinaryImageService');

const router = express.Router();
router.use(authenticateToken);

const imageService = new CloudinaryImageService();

// Ensure uploads/temp directory exists
const uploadsDir = path.join(__dirname, '../../uploads/temp');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('✅ Created uploads/temp directory');
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      // Images
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml',
      // Documents
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      // Text files
      'text/plain', 'text/csv', 'text/html', 'text/css', 'text/javascript',
      'application/json', 'application/xml', 'text/xml',
      // Archives
      'application/zip', 'application/x-rar-compressed', 'application/x-tar', 'application/gzip',
      // Videos
      'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-ms-wmv', 'video/webm',
      // Audio
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3', 'audio/x-m4a'
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé'), false);
    }
  }
});

// Helper function to determine file type
const getFileType = (mimeType) => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.includes('pdf')) return 'pdf';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'document';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'document';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
};

// GET /api/files - Get all files with filtering
router.get('/', [
  query('folder_id').optional().isInt(),
  query('search').optional().isString(),
  query('type').optional().isString(),
  query('titre').optional().isString()
], async (req, res) => {
  try {
    const { folder_id, search, type, titre } = req.query;
    const where = {
      supprime: false
    };

    if (folder_id) {
      where.folder_id = parseInt(folder_id);
    } else if (folder_id === null || folder_id === 'null') {
      where.folder_id = null;
    }

    if (search) {
      where[Op.or] = [
        { nom_fichier: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
        { titre: { [Op.like]: `%${search}%` } }
      ];
    }

    if (type) {
      where.type = type;
    }

    // Filter by titre to get all files of the same document
    if (titre) {
      where.titre = titre;
    }

    const files = await File.findAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['id', 'nom', 'prenom', 'email'] },
        { model: Circuit, as: 'circuit' }
      ],
      order: [['created_at', 'ASC']] // Order by creation date to show versions
    });

    res.json({ files });
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: 'Failed to get files', message: 'Erreur lors de la récupération des fichiers', details: error.message });
  }
});

// GET /api/files/folders - Get all folders
router.get('/folders', async (req, res) => {
  try {
    const folders = await Folder.findAll({
      where: { supprime: false },
      include: [
        { model: User, as: 'user', attributes: ['id', 'nom', 'prenom'] }
      ],
      order: [['created_at', 'DESC']]
    });

    // Count files in each folder
    const foldersWithCount = await Promise.all(
      folders.map(async (folder) => {
        const count = await File.count({
          where: { folder_id: folder.id, supprime: false }
        });
        return {
          ...folder.toJSON(),
          nombre_fichiers: count
        };
      })
    );

    res.json({ folders: foldersWithCount });
  } catch (error) {
    console.error('Get folders error:', error);
    res.status(500).json({ error: 'Failed to get folders', message: 'Erreur lors de la récupération des dossiers', details: error.message });
  }
});

// POST /api/files/upload - Upload files with metadata
router.post('/upload', upload.array('files', 10), async (req, res) => {
  console.log('=== DEBUG FILE UPLOAD ===');
  console.log('Files received:', req.files ? req.files.length : 0);
  console.log('Body:', req.body);
  console.log('User:', req.user?.id);
  console.log('==========================');

  try {
    if (!req.files || req.files.length === 0) {
      console.error('❌ No files uploaded');
      return res.status(400).json({ error: 'No files uploaded', message: 'Aucun fichier uploadé' });
    }

    const folder_id = req.body.folder_id ? parseInt(req.body.folder_id) : null;
    
    // Extract metadata from request body (same for all files in the batch)
    const metadata = {
      titre: req.body.titre || null,
      description: req.body.description || null,
      langue: req.body.langue || null,
      tags: req.body.tags || null,
      sujet: req.body.sujet || null,
      identifiant: req.body.identifiant || null,
      editeur: req.body.editeur || null,
      format: req.body.format || null,
      source: req.body.source || null,
      type_metadata: req.body.type || null,
      couverture: req.body.couverture || null,
      droits: req.body.droits || null,
      relations: req.body.relations || null,
      date_creation: req.body.date_creation || null
    };

    console.log('📋 Metadata extracted:', metadata);

    const uploadedFiles = [];
    const errors = [];

    for (const file of req.files) {
      try {
        console.log(`\n📤 Processing file: ${file.originalname}`);
        console.log(`   MIME type: ${file.mimetype}`);
        console.log(`   Size: ${file.size} bytes`);
        console.log(`   Path: ${file.path}`);

        // Check if file exists
        const fs = require('fs');
        if (!fs.existsSync(file.path)) {
          throw new Error(`File not found at path: ${file.path}`);
        }

        // Upload to Cloudinary - use direct upload for all file types
        console.log('   ☁️ Uploading to Cloudinary...');
        const cloudinary = require('cloudinary').v2;
        
        // Determine resource type based on file type
        let resourceType = 'auto';
        if (file.mimetype.startsWith('image/')) {
          resourceType = 'image';
        } else if (file.mimetype.startsWith('video/')) {
          resourceType = 'video';
        } else if (file.mimetype.startsWith('audio/')) {
          resourceType = 'video'; // Cloudinary uses 'video' for audio files
        } else if (file.mimetype.includes('pdf')) {
          resourceType = 'raw'; // PDFs as raw for better control
        } else {
          resourceType = 'auto'; // Let Cloudinary detect
        }
        
        console.log(`   📋 Resource type: ${resourceType}`);
        
        const result = await cloudinary.uploader.upload(file.path, {
          folder: 'file_manager',
          resource_type: resourceType,
          use_filename: false,
          unique_filename: true,
          overwrite: false
        });
        
        const uploadResult = {
          success: true,
          secure_url: result.secure_url,
          public_id: result.public_id
        };
        
        console.log('   ✅ Cloudinary upload result:', uploadResult ? 'Success' : 'Failed');
        
        if (!uploadResult || !uploadResult.success) {
          throw new Error(uploadResult?.error || 'Upload failed');
        }

        // Determine file type
        const fileType = getFileType(file.mimetype);

        // Use titre from metadata if provided, otherwise use filename
        const fileTitle = metadata.titre || file.originalname;

        // Parse tags if it's a string
        let tagsValue = metadata.tags;
        if (tagsValue && typeof tagsValue === 'string') {
          // If tags is a comma-separated string, convert to array
          tagsValue = tagsValue.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
        }

        console.log('   💾 Creating database record...');

        // Create file record with all metadata
        const fileRecord = await File.create({
          nom_fichier: file.originalname,
          titre: fileTitle,
          nom_fichier_stocke: uploadResult.public_id,
          chemin_fichier: uploadResult.secure_url,
          public_id: uploadResult.public_id,
          type_mime: file.mimetype,
          type: fileType,
          taille: file.size,
          extension: path.extname(file.originalname),
          folder_id: folder_id,
          user_id: req.user.id,
          description: metadata.description,
          langue: metadata.langue,
          sujet: metadata.sujet,
          identifiant: metadata.identifiant,
          editeur: metadata.editeur,
          format_metadata: metadata.format,
          source: metadata.source,
          type_metadata: metadata.type_metadata,
          couverture: metadata.couverture,
          droits: metadata.droits,
          relations: metadata.relations,
          date_creation: metadata.date_creation,
          tags: tagsValue,
          visibilite: 'Interne'
        });

        console.log('   ✅ Database record created:', fileRecord.id);

        // Update folder file count
        if (folder_id) {
          await Folder.increment('nombre_fichiers', { where: { id: folder_id } });
        }

        uploadedFiles.push(fileRecord.toJSON());

        // Clean up temp file
        try {
          fs.unlinkSync(file.path);
          console.log('   🗑️  Temp file cleaned up');
        } catch (cleanupError) {
          console.error('   ⚠️  Error cleaning up temp file:', cleanupError);
        }
      } catch (fileError) {
        console.error(`   ❌ Error uploading file ${file.originalname}:`, fileError);
        errors.push({
          file: file.originalname,
          error: fileError.message
        });
        // Continue with other files
      }
    }

    if (uploadedFiles.length === 0) {
      console.error('❌ No files were successfully uploaded');
      return res.status(500).json({ 
        error: 'Upload failed', 
        message: 'Aucun fichier n\'a pu être uploadé',
        details: errors
      });
    }

    console.log(`✅ Successfully uploaded ${uploadedFiles.length} file(s)`);
    if (errors.length > 0) {
      console.warn(`⚠️  ${errors.length} file(s) failed to upload`);
    }

    res.json({ 
      message: `${uploadedFiles.length} fichier(s) uploadé(s) avec succès`,
      files: uploadedFiles,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('❌ Upload files error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to upload files', 
      message: 'Erreur lors de l\'upload des fichiers', 
      details: error.message 
    });
  }
});

// POST /api/files/folders - Create folder
router.post('/folders', [
  body('nom').trim().isLength({ min: 1, max: 255 }).withMessage('Le nom du dossier est requis (1-255 caractères)'),
  body('parent_id').optional().isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { nom, parent_id } = req.body;

    const folder = await Folder.create({
      nom: nom.trim(),
      parent_id: parent_id ? parseInt(parent_id) : null,
      user_id: req.user.id,
      visibilite: 'Interne'
    });

    res.json({ message: 'Dossier créé avec succès', folder: folder.toJSON() });
  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({ error: 'Failed to create folder', message: 'Erreur lors de la création du dossier', details: error.message });
  }
});

function canAccessFile(req, file) {
  if (!req.user || !file) return false;
  if (['Administrateur', 'Patron', 'Web Master'].includes(req.user.role)) return true;
  return Number(file.user_id) === Number(req.user.id);
}

// GET /api/files/:id - Get a single file by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const file = await File.findByPk(id, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'nom', 'prenom', 'email'] },
        { model: Circuit, as: 'circuit' },
        { model: Folder, as: 'folder' }
      ]
    });

    if (!file || file.supprime) {
      return res.status(404).json({ error: 'File not found', message: 'Fichier non trouvé' });
    }

    if (!canAccessFile(req, file)) {
      return res.status(403).json({ error: 'Access denied', message: 'Accès refusé à ce fichier' });
    }

    res.json({ file });
  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({ error: 'Failed to get file', message: 'Erreur lors de la récupération du fichier', details: error.message });
  }
});

// GET /api/files/:id/download - Download file
router.get('/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    const file = await File.findByPk(id);

    if (!file || file.supprime) {
      return res.status(404).json({ error: 'File not found', message: 'Fichier non trouvé' });
    }

    if (!canAccessFile(req, file)) {
      return res.status(403).json({ error: 'Access denied', message: 'Accès refusé à ce fichier' });
    }

    // Increment download count
    await file.increment('nombre_downloads');

    // Redirect to Cloudinary URL or serve file
    res.redirect(file.chemin_fichier);
  } catch (error) {
    console.error('Download file error:', error);
    res.status(500).json({ error: 'Failed to download file', message: 'Erreur lors du téléchargement', details: error.message });
  }
});

// PUT /api/files/:id - Update a file
router.put('/:id', async (req, res) => {
  try {
    const file = await File.findByPk(req.params.id);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check permissions - only owner or admin can update
    if (file.user_id !== req.user.id && req.user.role !== 'Administrateur') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const updateData = {};
    
    // Allow updating circuit-related fields
    if (req.body.circuit_id !== undefined) {
      updateData.circuit_id = req.body.circuit_id || null;
    }
    if (req.body.etape_actuelle !== undefined) {
      updateData.etape_actuelle = req.body.etape_actuelle || null;
    }
    if (req.body.statut_workflow !== undefined) {
      updateData.statut_workflow = req.body.statut_workflow;
    }

    // Allow updating other metadata fields
    if (req.body.titre !== undefined) updateData.titre = req.body.titre;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.langue !== undefined) updateData.langue = req.body.langue;
    if (req.body.tags !== undefined) {
      const tagsValue = Array.isArray(req.body.tags) 
        ? req.body.tags 
        : (typeof req.body.tags === 'string' ? req.body.tags.split(',').map(t => t.trim()) : []);
      updateData.tags = tagsValue;
    }
    if (req.body.visibilite !== undefined) updateData.visibilite = req.body.visibilite;

    await file.update(updateData);

    const updatedFile = await File.findByPk(file.id, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'nom', 'prenom', 'email'] },
        { model: Circuit, as: 'circuit' }
      ]
    });

    res.json({ file: updatedFile });
  } catch (error) {
    console.error('Update file error:', error);
    res.status(500).json({ error: 'Failed to update file', message: error.message });
  }
});

// DELETE /api/files/:id - Delete file
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const file = await File.findByPk(id);

    if (!file) {
      return res.status(404).json({ error: 'File not found', message: 'Fichier non trouvé' });
    }

    if (!canAccessFile(req, file)) {
      return res.status(403).json({ error: 'Access denied', message: 'Accès refusé à ce fichier' });
    }

    // Soft delete
    await file.update({
      supprime: true,
      date_suppression: new Date()
    });

    // Decrement folder file count
    if (file.folder_id) {
      await Folder.decrement('nombre_fichiers', { where: { id: file.folder_id } });
    }

    res.json({ message: 'Fichier supprimé avec succès' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file', message: 'Erreur lors de la suppression', details: error.message });
  }
});

// DELETE /api/files/folders/:id - Delete folder
router.delete('/folders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const folder = await Folder.findByPk(id);

    if (!folder) {
      return res.status(404).json({ error: 'Folder not found', message: 'Dossier non trouvé' });
    }

    // Soft delete folder and all files in it
    await folder.update({
      supprime: true,
      date_suppression: new Date()
    });

    await File.update(
      { supprime: true, date_suppression: new Date() },
      { where: { folder_id: id } }
    );

    res.json({ message: 'Dossier supprimé avec succès' });
  } catch (error) {
    console.error('Delete folder error:', error);
    res.status(500).json({ error: 'Failed to delete folder', message: 'Erreur lors de la suppression', details: error.message });
  }
});

module.exports = router;


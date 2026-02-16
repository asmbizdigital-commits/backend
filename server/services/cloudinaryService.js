const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const path = require('path');

// Configuration Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configuration Multer pour l'upload temporaire
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/temp/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'employee-photo-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  },
  fileFilter: function (req, file, cb) {
    // Vérifier le type de fichier
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Seules les images sont autorisées'), false);
    }
  }
});

class CloudinaryService {
  // Upload d'une photo d'employé
  static async uploadEmployeePhoto(file, employeeId) {
    try {
      // Upload vers Cloudinary
      const result = await cloudinary.uploader.upload(file.path, {
        folder: 'hotel-beatrice/employees',
        public_id: `employee_${employeeId}_${Date.now()}`,
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto' }
        ],
        resource_type: 'image'
      });

      return {
        success: true,
        url: result.secure_url,
        public_id: result.public_id
      };
    } catch (error) {
      console.error('Erreur lors de l\'upload Cloudinary:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Supprimer une photo d'employé
  static async deleteEmployeePhoto(publicId) {
    try {
      if (!publicId) return { success: true };

      const result = await cloudinary.uploader.destroy(publicId);
      
      return {
        success: result.result === 'ok',
        result: result.result
      };
    } catch (error) {
      console.error('Erreur lors de la suppression Cloudinary:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Extraire le public_id d'une URL Cloudinary
  static extractPublicId(url) {
    if (!url) return null;
    
    const matches = url.match(/\/v\d+\/(.+)\.(jpg|jpeg|png|gif|webp)/);
    if (matches && matches[1]) {
      return matches[1];
    }
    return null;
  }

  // Obtenir l'URL optimisée pour l'affichage
  static getOptimizedUrl(originalUrl, options = {}) {
    if (!originalUrl) return null;

    const {
      width = 200,
      height = 200,
      crop = 'fill',
      gravity = 'face',
      quality = 'auto'
    } = options;

    // Si c'est déjà une URL Cloudinary, on peut l'optimiser
    if (originalUrl.includes('cloudinary.com')) {
      const publicId = this.extractPublicId(originalUrl);
      if (publicId) {
        return cloudinary.url(publicId, {
          width,
          height,
          crop,
          gravity,
          quality
        });
      }
    }

    return originalUrl;
  }

  // Upload d'une image générique vers Cloudinary
  static async uploadImage(imageBuffer, folder, options = {}) {
    try {
      console.log('☁️ Upload vers Cloudinary - Buffer size:', imageBuffer.length);
      console.log('📁 Dossier:', folder);
      console.log('⚙️ Options:', options);

      const uploadOptions = {
        folder: folder,
        resource_type: 'image',
        quality: 'auto',
        ...options
      };

      const result = await cloudinary.uploader.upload(
        `data:image/jpeg;base64,${imageBuffer.toString('base64')}`,
        uploadOptions
      );

      console.log('✅ Upload Cloudinary réussi:', result.public_id);

      return {
        success: true,
        public_id: result.public_id,
        secure_url: result.secure_url,
        url: result.url,
        created_at: result.created_at,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes
      };
    } catch (error) {
      console.error('❌ Erreur upload Cloudinary:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Upload d'un buffer d'image directement
  static async uploadImageBuffer(imageBuffer, folder, options = {}) {
    try {
      console.log('☁️ Upload buffer vers Cloudinary - Taille:', imageBuffer.length);
      
      const uploadOptions = {
        folder: folder,
        resource_type: 'image',
        quality: 'auto',
        ...options
      };

      const result = await cloudinary.uploader.upload(
        `data:image/jpeg;base64,${imageBuffer.toString('base64')}`,
        uploadOptions
      );

      return {
        success: true,
        public_id: result.public_id,
        secure_url: result.secure_url,
        url: result.url,
        created_at: result.created_at,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes
      };
    } catch (error) {
      console.error('❌ Erreur upload buffer Cloudinary:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /** Upload d'un buffer (image) avec type MIME explicite — pour pièces justificatives, etc. */
  static async uploadBuffer(buffer, folder, options = {}) {
    try {
      const mimetype = options.mimetype || 'image/jpeg';
      const dataUri = `data:${mimetype};base64,${buffer.toString('base64')}`;
      const uploadOptions = {
        folder: folder,
        resource_type: 'image',
        quality: 'auto',
        ...options
      };
      delete uploadOptions.mimetype;
      const result = await cloudinary.uploader.upload(dataUri, uploadOptions);
      return {
        success: true,
        public_id: result.public_id,
        secure_url: result.secure_url,
        url: result.url
      };
    } catch (error) {
      console.error('❌ Erreur upload buffer Cloudinary:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = {
  CloudinaryService,
  upload
};
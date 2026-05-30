const express = require('express');
const router = express.Router();
const multer = require('multer');
const Employee = require('../models/Employee');
const Departement = require('../models/Departement');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { CloudinaryService, upload } = require('../services/cloudinaryService');
const {
  parseWorkbookBuffer,
  validateRow,
  buildTemplateBuffer,
  isInstructionOrExampleRow,
  isSparseRow
} = require('../services/employeeExcelImport');
const fs = require('fs');
const path = require('path');

const RH_IMPORT_ROLES = ['Superviseur RH', 'Administrateur', 'Patron'];

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      /\.(xlsx|xls)$/i.test(file.originalname) ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel';
    cb(ok ? null : new Error('Fichier Excel (.xlsx) requis'), ok);
  }
});

// Middleware pour valider les données d'employé (création)
const validateEmployeeData = (req, res, next) => {
  const requiredFields = [
    'civilite', 'nom_famille', 'prenoms', 'date_naissance', 'lieu_naissance',
    'nationalite', 'adresse', 'code_postal', 'ville', 'pays', 'telephone_personnel',
    'email_personnel', 'poste', 'departement_id', 'date_embauche', 'type_contrat', 'temps_travail'
  ];

  const missingFields = requiredFields.filter(field => !req.body[field]);
  
  if (missingFields.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Champs obligatoires manquants: ${missingFields.join(', ')}`
    });
  }

  // Validation de l'email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(req.body.email_personnel)) {
    return res.status(400).json({
      success: false,
      message: 'Format d\'email invalide'
    });
  }

  // Convertir departement_id et sous_departement_id en entiers si présents
  if (req.body.departement_id) {
    req.body.departement_id = parseInt(req.body.departement_id);
  }
  if (req.body.sous_departement_id) {
    req.body.sous_departement_id = parseInt(req.body.sous_departement_id);
  }

  next();
};

// Middleware pour valider les données d'employé (mise à jour)
const validateEmployeeUpdateData = (req, res, next) => {
  // Validation de l'email seulement s'il est présent
  if (req.body.email_personnel) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(req.body.email_personnel)) {
      return res.status(400).json({
        success: false,
        message: 'Format d\'email invalide'
      });
    }
  }

  // Convertir departement_id et sous_departement_id en entiers si présents
  if (req.body.departement_id) {
    req.body.departement_id = parseInt(req.body.departement_id);
  }
  if (req.body.sous_departement_id) {
    req.body.sous_departement_id = parseInt(req.body.sous_departement_id);
  }

  next();
};

// GET /api/employees - Récupérer tous les employés
router.get('/', authenticateToken, async (req, res) => {
  try {
    const filters = {
      departement: req.query.departement,
      statut: req.query.statut,
      search: req.query.search
    };

    const employees = await Employee.findAll(filters);
    
    res.json({
      success: true,
      data: employees,
      count: employees.length
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des employés:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des employés'
    });
  }
});

// GET /api/employees/stats - Récupérer les statistiques des employés
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await Employee.getStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des statistiques'
    });
  }
});

// GET /api/employees/import/template — modèle Excel import par lot
router.get('/import/template', authenticateToken, requireRole(RH_IMPORT_ROLES), async (req, res) => {
  try {
    const departements = await Departement.findAll({
      where: { statut: 'Actif' },
      attributes: ['id', 'nom', 'code'],
      order: [['nom', 'ASC']]
    });
    const buffer = buildTemplateBuffer(departements);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="modele_import_employes.xlsx"'
    );
    res.send(buffer);
  } catch (error) {
    console.error('Erreur génération modèle employés:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la génération du modèle Excel'
    });
  }
});

// POST /api/employees/import/bulk — enregistrement par lot depuis Excel
router.post(
  '/import/bulk',
  authenticateToken,
  requireRole(RH_IMPORT_ROLES),
  excelUpload.single('file'),
  async (req, res) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({
          success: false,
          message: 'Fichier Excel requis (champ file)'
        });
      }

      const parsed = parseWorkbookBuffer(req.file.buffer);
      if (!parsed.length) {
        return res.status(400).json({
          success: false,
          message: 'Aucune ligne de données dans le fichier (feuille Employes, à partir de la ligne 4)'
        });
      }

      const dataRows = parsed;

      const created = [];
      const errors = [];
      const seenEmails = new Set();

      for (const { data, rowIndex } of dataRows) {
        if (isInstructionOrExampleRow(data)) continue;
        if (isSparseRow(data)) continue;

        const hasAny =
          data.nom_famille ||
          data.prenoms ||
          data.email_personnel ||
          data.poste;
        if (!hasAny) continue;

        const validationError = validateRow(data, rowIndex);
        if (validationError) {
          errors.push({ row: rowIndex, message: validationError });
          continue;
        }

        const emailKey = data.email_personnel.toLowerCase();
        if (seenEmails.has(emailKey)) {
          errors.push({ row: rowIndex, message: `Ligne ${rowIndex} : email en double dans le fichier` });
          continue;
        }
        seenEmails.add(emailKey);

        const existing = await Employee.findAll({ search: data.email_personnel });
        if (existing.some((emp) => emp.email_personnel?.toLowerCase() === emailKey)) {
          errors.push({
            row: rowIndex,
            message: `Ligne ${rowIndex} : un employé avec cet email existe déjà`
          });
          continue;
        }

        try {
          const newEmployee = await Employee.create({
            ...data,
            created_by: req.user.id,
            updated_by: req.user.id
          });
          created.push({ row: rowIndex, id: newEmployee.id, email: data.email_personnel });
        } catch (err) {
          errors.push({
            row: rowIndex,
            message: `Ligne ${rowIndex} : ${err.message || 'erreur création'}`
          });
        }
      }

      res.json({
        success: errors.length === 0,
        message:
          created.length > 0
            ? `${created.length} employé(s) créé(s)${errors.length ? `, ${errors.length} erreur(s)` : ''}`
            : 'Aucun employé créé',
        data: { created: created.length, errors }
      });
    } catch (error) {
      console.error('Erreur import employés:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur lors de l\'import Excel'
      });
    }
  }
);

// GET /api/employees/:id - Récupérer un employé par ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employé non trouvé'
      });
    }
    
    res.json({
      success: true,
      data: employee
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'employé:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération de l\'employé'
    });
  }
});

// POST /api/employees - Créer un nouvel employé
router.post('/', authenticateToken, requireRole(['Superviseur RH', 'Administrateur', 'Patron']), upload.single('photo'), validateEmployeeData, async (req, res) => {
  try {
    // Vérifier si l'email existe déjà
    const existingEmployee = await Employee.findAll({ search: req.body.email_personnel });
    const emailExists = existingEmployee.some(emp => emp.email_personnel === req.body.email_personnel);
    
    if (emailExists) {
      return res.status(400).json({
        success: false,
        message: 'Un employé avec cet email existe déjà'
      });
    }

    const employeeData = {
      ...req.body,
      created_by: req.user.id,
      updated_by: req.user.id
    };

    // Créer l'employé d'abord pour obtenir l'ID
    const newEmployee = await Employee.create(employeeData);
    
    // Si une photo a été uploadée, l'envoyer vers Cloudinary
    if (req.file) {
      try {
        const uploadResult = await CloudinaryService.uploadEmployeePhoto(req.file, newEmployee.id);
        
        if (uploadResult.success) {
          // Mettre à jour l'employé avec l'URL de la photo
          await Employee.updatePhoto(newEmployee.id, uploadResult.url);
          newEmployee.photo_url = uploadResult.url;
        }
        
        // Supprimer le fichier temporaire
        fs.unlinkSync(req.file.path);
      } catch (photoError) {
        console.error('Erreur lors de l\'upload de la photo:', photoError);
        // Ne pas faire échouer la création de l'employé si l'upload de photo échoue
      }
    }
    
    res.status(201).json({
      success: true,
      message: 'Employé créé avec succès',
      data: newEmployee
    });
  } catch (error) {
    console.error('Erreur lors de la création de l\'employé:', error);
    
    // Nettoyer le fichier temporaire en cas d'erreur
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    const detail = error?.message || String(error);
    console.error('Détail:', detail);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la création de l\'employé',
      error: process.env.NODE_ENV === 'production' ? undefined : detail
    });
  }
});

// PUT /api/employees/:id - Mettre à jour un employé
router.put('/:id', authenticateToken, requireRole(['Superviseur RH', 'Administrateur', 'Patron']), upload.single('photo'), validateEmployeeUpdateData, async (req, res) => {
  try {
    // Vérifier si l'employé existe
    const existingEmployee = await Employee.findById(req.params.id);
    if (!existingEmployee) {
      return res.status(404).json({
        success: false,
        message: 'Employé non trouvé'
      });
    }

    // Vérifier si l'email existe déjà (sauf pour l'employé actuel)
    const employeesWithEmail = await Employee.findAll({ search: req.body.email_personnel });
    const emailExists = employeesWithEmail.some(emp => 
      emp.email_personnel === req.body.email_personnel && emp.id !== parseInt(req.params.id)
    );
    
    if (emailExists) {
      return res.status(400).json({
        success: false,
        message: 'Un autre employé avec cet email existe déjà'
      });
    }

    const employeeData = {
      ...req.body,
      updated_by: req.user.id
    };

    // Si une nouvelle photo a été uploadée
    if (req.file) {
      try {
        // Supprimer l'ancienne photo de Cloudinary si elle existe
        if (existingEmployee.photo_url) {
          const oldPublicId = CloudinaryService.extractPublicId(existingEmployee.photo_url);
          if (oldPublicId) {
            await CloudinaryService.deleteEmployeePhoto(oldPublicId);
          }
        }

        // Uploader la nouvelle photo
        const uploadResult = await CloudinaryService.uploadEmployeePhoto(req.file, req.params.id);
        
        if (uploadResult.success) {
          // Mettre à jour seulement la photo
          await Employee.updatePhoto(req.params.id, uploadResult.url);
          employeeData.photo_url = uploadResult.url;
        }
        
        // Supprimer le fichier temporaire
        fs.unlinkSync(req.file.path);
      } catch (photoError) {
        console.error('Erreur lors de l\'upload de la photo:', photoError);
        // Nettoyer le fichier temporaire en cas d'erreur
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      }
    }

    // Mettre à jour l'employé avec les données fournies
    const updated = await Employee.updatePartial(req.params.id, employeeData);
    
    if (updated) {
      const updatedEmployee = await Employee.findById(req.params.id);
      res.json({
        success: true,
        message: 'Employé mis à jour avec succès',
        data: updatedEmployee
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour de l\'employé'
      });
    }
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'employé:', error);
    
    // Nettoyer le fichier temporaire en cas d'erreur
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la mise à jour de l\'employé'
    });
  }
});

// DELETE /api/employees/:id - Supprimer un employé
router.delete('/:id', authenticateToken, requireRole(['Superviseur RH', 'Administrateur', 'Patron']), async (req, res) => {
  try {
    // Vérifier si l'employé existe
    const existingEmployee = await Employee.findById(req.params.id);
    if (!existingEmployee) {
      return res.status(404).json({
        success: false,
        message: 'Employé non trouvé'
      });
    }

    // Supprimer la photo de Cloudinary si elle existe
    if (existingEmployee.photo_url) {
      try {
        const publicId = CloudinaryService.extractPublicId(existingEmployee.photo_url);
        if (publicId) {
          await CloudinaryService.deleteEmployeePhoto(publicId);
        }
      } catch (photoError) {
        console.error('Erreur lors de la suppression de la photo:', photoError);
        // Ne pas faire échouer la suppression de l'employé si la suppression de photo échoue
      }
    }

    const deleted = await Employee.delete(req.params.id);
    
    if (deleted) {
      res.json({
        success: true,
        message: 'Employé supprimé avec succès'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la suppression de l\'employé'
      });
    }
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'employé:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la suppression de l\'employé'
    });
  }
});

module.exports = router;

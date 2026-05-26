const express = require('express');
const router = express.Router();
const Employee = require('../models/Employee');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { CloudinaryService, upload } = require('../services/cloudinaryService');
const fs = require('fs');
const path = require('path');

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

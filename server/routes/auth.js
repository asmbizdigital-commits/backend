const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticateToken, generateToken } = require('../middleware/auth');

const router = express.Router();

const USER_GEO_INCLUDES = [
  {
    model: require('../models/DirectionProvinciale'),
    as: 'DirectionProvinciale',
    attributes: ['id', 'nom', 'code', 'province'],
    required: false
  },
  {
    model: require('../models/BureauInternational'),
    as: 'BureauInternational',
    attributes: ['id', 'nom', 'code', 'pays', 'ville'],
    required: false
  }
];

function serializeAuthUser(user) {
  const j = typeof user?.toJSON === 'function' ? user.toJSON() : { ...user };
  return {
    id: j.id,
    nom: j.nom,
    prenom: j.prenom,
    email: j.email,
    role: j.role,
    telephone: j.telephone,
    actif: j.actif,
    derniere_connexion: j.derniere_connexion,
    zone: j.zone ?? null,
    direction_provinciale_id: j.direction_provinciale_id ?? null,
    bureau_international_id: j.bureau_international_id ?? null,
    DirectionProvinciale: j.DirectionProvinciale ?? null,
    BureauInternational: j.BureauInternational ?? null
  };
}

async function loadUserForAuth(userId) {
  return User.findByPk(userId, {
    attributes: { exclude: ['mot_de_passe'] },
    include: USER_GEO_INCLUDES
  });
}

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('mot_de_passe').isLength({ min: 6 })
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Données de validation invalides',
        errors: errors.array()
      });
    }

    const { email, mot_de_passe } = req.body;

    // Find user by email
    const user = await User.findOne({ 
      where: { email },
      attributes: { exclude: [] } // Include password for verification
    });

    if (!user || !user.actif) {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        message: 'Email ou mot de passe incorrect'
      });
    }

    // Check password
    const isPasswordValid = await user.checkPassword(mot_de_passe);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        message: 'Email ou mot de passe incorrect'
      });
    }

    // Update last login
    user.derniere_connexion = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user.id);

    const userWithGeo = await loadUserForAuth(user.id);

    // Return user data (without password) and token
    const userData = serializeAuthUser(userWithGeo || user);

    res.json({
      message: 'Connexion réussie',
      user: userData,
      token,
      expiresIn: process.env.JWT_EXPIRES_IN || '24h'
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'Login failed',
      message: 'Erreur lors de la connexion'
    });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // In a more complex system, you might want to blacklist the token
    // For now, we'll just return a success message
    res.json({ 
      message: 'Déconnexion réussie'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ 
      error: 'Logout failed',
      message: 'Erreur lors de la déconnexion'
    });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userWithGeo = await loadUserForAuth(req.user.id);
    const userData = serializeAuthUser(userWithGeo || req.user);

    res.json({
      user: userData
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      error: 'Failed to get profile',
      message: 'Erreur lors de la récupération du profil'
    });
  }
});

// POST /api/auth/refresh
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    // Generate new token
    const token = generateToken(req.user.id);

    res.json({
      message: 'Token rafraîchi',
      token,
      expiresIn: process.env.JWT_EXPIRES_IN || '24h'
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ 
      error: 'Token refresh failed',
      message: 'Erreur lors du rafraîchissement du token'
    });
  }
});

// POST /api/auth/change-password
router.post('/change-password', [
  authenticateToken,
  body('currentPassword').isLength({ min: 6 }),
  body('newPassword').isLength({ min: 6 })
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

    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.findByPk(req.user.id);

    // Verify current password
    const isCurrentPasswordValid = await user.checkPassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ 
        error: 'Invalid current password',
        message: 'Mot de passe actuel incorrect'
      });
    }

    // Update password
    user.mot_de_passe = newPassword;
    await user.save();

    res.json({ 
      message: 'Mot de passe modifié avec succès'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      error: 'Password change failed',
      message: 'Erreur lors du changement de mot de passe'
    });
  }
});

module.exports = router; 
const express = require('express');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const User = require('../models/User');
const { authenticateToken, generateToken } = require('../middleware/auth');
const { validatePasswordStrength } = require('../utils/passwordPolicy');
const { sendPasswordResetEmail } = require('../services/emailService');
const { setAuthCookie, clearAuthCookie } = require('../utils/authCookie');

const router = express.Router();

const JWT_EXPIRES_DEFAULT = process.env.JWT_EXPIRES_IN || '8h';
const JWT_EXPIRES_REMEMBER = process.env.JWT_EXPIRES_REMEMBER || '7d';
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 h

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
    attributes: { exclude: ['mot_de_passe', 'password_reset_token'] },
    include: USER_GEO_INCLUDES
  });
}

function hashResetToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

async function bumpTokenVersion(user) {
  const next = Number(user.token_version || 0) + 1;
  await user.update({ token_version: next });
  return next;
}

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('mot_de_passe').isLength({ min: 1, max: 128 }),
  body('remember_me').optional().isBoolean()
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

    const { email, mot_de_passe } = req.body;
    const rememberMe =
      req.body.remember_me === true ||
      req.body.remember_me === 'true' ||
      req.body.remember_me === 1 ||
      req.body.remember_me === '1';

    const user = await User.findOne({
      where: { email },
      attributes: { exclude: [] }
    });

    if (!user || !user.actif) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email ou mot de passe incorrect'
      });
    }

    const isPasswordValid = await user.checkPassword(mot_de_passe);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email ou mot de passe incorrect'
      });
    }

    await user.update({ derniere_connexion: new Date() });

    const expiresIn = rememberMe ? JWT_EXPIRES_REMEMBER : JWT_EXPIRES_DEFAULT;
    const token = generateToken(user.id, {
      expiresIn,
      tokenVersion: user.token_version || 0
    });
    setAuthCookie(res, token, expiresIn);

    const userWithGeo = await loadUserForAuth(user.id);
    const userData = serializeAuthUser(userWithGeo || user);

    res.json({
      message: 'Connexion réussie',
      user: userData,
      expiresIn,
      rememberMe
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: 'Erreur lors de la connexion'
    });
  }
});

// POST /api/auth/logout — invalide les JWT de cette version
// POST /api/auth/logout — invalide JWT + efface cookie (tolère cookie déjà invalide)
router.post('/logout', async (req, res) => {
  try {
    // Tente d'authentifier pour bump token_version ; sinon efface juste le cookie
    const { extractTokenFromRequest } = require('../utils/authCookie');
    const jwt = require('jsonwebtoken');
    const raw = extractTokenFromRequest(req);
    if (raw) {
      try {
        const decoded = jwt.verify(raw, process.env.JWT_SECRET);
        const user = await User.findByPk(decoded.userId);
        if (user) await bumpTokenVersion(user);
      } catch {
        /* cookie expiré / invalide */
      }
    }
    clearAuthCookie(res);
    res.json({ message: 'Déconnexion réussie' });
  } catch (error) {
    console.error('Logout error:', error);
    clearAuthCookie(res);
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
    const expiresIn = JWT_EXPIRES_DEFAULT;
    const token = generateToken(req.user.id, {
      expiresIn,
      tokenVersion: req.user.token_version || 0
    });
    setAuthCookie(res, token, expiresIn);

    res.json({
      message: 'Token rafraîchi',
      expiresIn
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      error: 'Token refresh failed',
      message: 'Erreur lors du rafraîchissement du token'
    });
  }
});

// POST /api/auth/forgot-password — réponse toujours générique
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail()
], async (req, res) => {
  const generic = {
    message:
      'Si un compte existe pour cet email, un lien de réinitialisation a été envoyé.'
  };

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Email invalide'
      });
    }

    const { email } = req.body;
    const user = await User.findOne({ where: { email, actif: true } });

    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashed = hashResetToken(rawToken);
      await user.update({
        password_reset_token: hashed,
        password_reset_expires: new Date(Date.now() + RESET_TOKEN_TTL_MS)
      });

      const emailResult = await sendPasswordResetEmail({
        email: user.email,
        prenom: user.prenom,
        nom: user.nom,
        resetToken: rawToken
      });

      if (!emailResult.sent) {
        console.warn('[auth] reset email not sent:', emailResult.error);
      }
    }

    return res.json(generic);
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.json(generic);
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', [
  body('token').isString().isLength({ min: 32, max: 128 }),
  body('mot_de_passe').isLength({ min: 8, max: 128 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Données invalides'
      });
    }

    const strength = validatePasswordStrength(req.body.mot_de_passe);
    if (!strength.ok) {
      return res.status(400).json({
        error: 'Weak password',
        message: strength.message
      });
    }

    const hashed = hashResetToken(req.body.token);
    const user = await User.findOne({
      where: {
        password_reset_token: hashed,
        password_reset_expires: { [Op.gt]: new Date() },
        actif: true
      }
    });

    if (!user) {
      return res.status(400).json({
        error: 'Invalid token',
        message: 'Lien de réinitialisation invalide ou expiré.'
      });
    }

    user.mot_de_passe = req.body.mot_de_passe;
    user.password_reset_token = null;
    user.password_reset_expires = null;
    user.token_version = Number(user.token_version || 0) + 1;
    await user.save();

    res.json({
      message: 'Mot de passe mis à jour. Vous pouvez vous connecter.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      error: 'Reset failed',
      message: 'Erreur lors de la réinitialisation'
    });
  }
});

// POST /api/auth/change-password
router.post('/change-password', [
  authenticateToken,
  body('currentPassword').isLength({ min: 1, max: 128 }),
  body('newPassword').isLength({ min: 8, max: 128 })
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

    const strength = validatePasswordStrength(req.body.newPassword);
    if (!strength.ok) {
      return res.status(400).json({
        error: 'Weak password',
        message: strength.message
      });
    }

    const { currentPassword, newPassword } = req.body;
    const user = await User.findByPk(req.user.id);

    const isCurrentPasswordValid = await user.checkPassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        error: 'Invalid current password',
        message: 'Mot de passe actuel incorrect'
      });
    }

    user.mot_de_passe = newPassword;
    user.token_version = Number(user.token_version || 0) + 1;
    await user.save();

    const token = generateToken(user.id, {
      expiresIn: JWT_EXPIRES_DEFAULT,
      tokenVersion: user.token_version
    });
    setAuthCookie(res, token, JWT_EXPIRES_DEFAULT);

    res.json({
      message: 'Mot de passe modifié avec succès',
      expiresIn: JWT_EXPIRES_DEFAULT
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

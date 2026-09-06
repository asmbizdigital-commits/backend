const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { extractTokenFromRequest } = require('../utils/authCookie');

// Middleware to verify JWT token (cookie HttpOnly prioritaire, sinon Bearer)
const authenticateToken = async (req, res, next) => {
  try {
    const token = extractTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({ 
        error: 'Access token required',
        message: 'Token d\'accès requis'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findByPk(decoded.userId, {
      attributes: { exclude: ['mot_de_passe', 'password_reset_token'] }
    });

    if (!user || !user.actif) {
      return res.status(401).json({ 
        error: 'Invalid or inactive user',
        message: 'Utilisateur invalide ou inactif'
      });
    }

    const tokenVersion = Number(user.token_version || 0);
    const claimVersion = Number(decoded.tv ?? 0);
    if (claimVersion !== tokenVersion) {
      return res.status(401).json({
        error: 'Token revoked',
        message: 'Session invalidée. Veuillez vous reconnecter.'
      });
    }

    req.user = user;
    req.authToken = token;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token',
        message: 'Token invalide'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        message: 'Token expiré'
      });
    }
    console.error('Auth middleware error:', error);
    return res.status(500).json({ 
      error: 'Authentication error',
      message: 'Erreur d\'authentification'
    });
  }
};

const requireRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Authentification requise'
      });
    }

    const requiredRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];

    if (!requiredRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: `Permissions insuffisantes. Rôle requis: ${requiredRoles.join(', ')}`,
        requiredRole: requiredRoles,
        userRole: req.user.role
      });
    }

    next();
  };
};

const canAccessResource = (resourceUserIdField = 'user_id') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Authentification requise'
      });
    }

    const resourceUserId = req.body[resourceUserIdField] || req.params[resourceUserIdField] || req.query[resourceUserIdField];
    
    if (req.user.role === 'Patron' || req.user.role === 'Administrateur') {
      return next();
    }

    if (resourceUserId && parseInt(resourceUserId) === req.user.id) {
      return next();
    }

    return res.status(403).json({ 
      error: 'Access denied',
      message: 'Accès refusé'
    });
  };
};

const generateToken = (userId, { expiresIn, tokenVersion = 0 } = {}) => {
  return jwt.sign(
    { userId, tv: Number(tokenVersion) || 0 },
    process.env.JWT_SECRET,
    { expiresIn: expiresIn || process.env.JWT_EXPIRES_IN || '8h' }
  );
};

module.exports = {
  authenticateToken,
  requireRole,
  canAccessResource,
  generateToken
};

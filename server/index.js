const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const WEAK_JWT_SECRETS = new Set([
  '',
  'secret',
  'jwt_secret',
  'your-super-secret-jwt-key-change-this-in-production',
  'change-me',
  'changeme'
]);

function assertSecureJwtSecret() {
  const secret = process.env.JWT_SECRET || '';
  const weak = WEAK_JWT_SECRETS.has(secret) || secret.length < 32;
  if (!weak) return;
  const msg =
    'JWT_SECRET manquant ou trop faible (min. 32 caractères, pas de placeholder). Définissez une valeur forte dans les variables d’environnement.';
  if (process.env.NODE_ENV === 'production') {
    console.error(`FATAL: ${msg}`);
    process.exit(1);
  }
  console.warn(`⚠️ SÉCURITÉ: ${msg} (toléré hors production uniquement)`);
}
assertSecureJwtSecret();

/**
 * CORS entièrement piloté par l’env (modifiable sur Render sans redeploy de code) :
 * - CORS_ORIGINS : liste séparée par des virgules
 * - CORS_ALLOW_ONRENDER : "true" pour autoriser https://*.onrender.com
 */
const corsAllowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const corsAllowOnrender =
  String(process.env.CORS_ALLOW_ONRENDER || 'false').toLowerCase() === 'true';

if (corsAllowedOrigins.length === 0) {
  console.warn(
    '⚠️ CORS_ORIGINS est vide : aucune origine navigateur ne sera autorisée (sauf abs. Origin). Définissez CORS_ORIGINS sur Render / .env.'
  );
} else {
  console.log(`🔗 CORS origines autorisées (${corsAllowedOrigins.length}) : ${corsAllowedOrigins.join(', ')}`);
}
if (corsAllowOnrender) {
  console.log('🔗 CORS_ALLOW_ONRENDER=true → https://*.onrender.com autorisé');
}

function isCorsOriginAllowed(origin) {
  if (!origin) return true;
  if (corsAllowedOrigins.includes(origin)) return true;
  if (corsAllowOnrender && /^https:\/\/[\w-]+\.onrender\.com$/i.test(origin)) return true;
  return false;
}

const corsOptions = {
  origin(origin, callback) {
    if (isCorsOriginAllowed(origin)) {
      return callback(null, true);
    }
    console.warn(`CORS blocked origin: ${origin}`);
    return callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Cache-Control',
    'X-File-Name'
  ],
  exposedHeaders: ['Content-Length'],
  maxAge: 86400
};

const { sequelize } = require('./config/database');
// Import models to establish associations
require('./models/index');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const roomRoutes = require('./routes/chambres');
const issueRoutes = require('./routes/problematiques');
const taskRoutes = require('./routes/taches');
const expenseRoutes = require('./routes/depenses');
const inventoryRoutes = require('./routes/inventaire');
const affectationRoutes = require('./routes/affectations');
const dashboardRoutes = require('./routes/dashboard');
const fournisseurRoutes = require('./routes/fournisseurs');
const achatRoutes = require('./routes/achats');
const mouvementStockRoutes = require('./routes/mouvements-stock');
const entrepotRoutes = require('./routes/entrepots');
const caisseRoutes = require('./routes/caisses');
const paiementsRoutes = require('./routes/paiements');
const encaissementsRoutes = require('./routes/encaissements');
const demandesRoutes = require('./routes/demandes');
const demandesAffectationRoutes = require('./routes/demandes-affectation');
const notificationsRoutes = require('./routes/notifications');
const departementRoutes = require('./routes/departements');
const sousDepartementRoutes = require('./routes/sous-departements');
const demandesFondsRoutes = require('./routes/demandes-fonds');
const fichesExecutionRoutes = require('./routes/fiches-execution');
const cycleVieArticlesRoutes = require('./routes/cycle-vie-articles');
const buanderieRoutes = require('./routes/buanderie');
const paiementsPartielsRoutes = require('./routes/paiements-partiels');
const rappelsPaiementRoutes = require('./routes/rappels-paiement');
const resetRoutes = require('./routes/reset');
const employeeRoutes = require('./routes/employees');
const organigrammeRoutes = require('./routes/organigramme');
const bonsMenageRoutes = require('./routes/bons-menage');
const contratsRoutes = require('./routes/contrats');
const documentsRHRoutes = require('./routes/documents-rh');
const offresEmploiRoutes = require('./routes/offres-emploi');
const offresEmploiPublicRoutes = require('./routes/offres-emploi-public');
const dependantsRoutes = require('./routes/dependants');
const sanctionsRoutes = require('./routes/sanctions');
const sanctionsProRoutes = require('./routes/sanctions-pro');
const demandesCongesRoutes = require('./routes/demandes-conges');
const absencesRoutes = require('./routes/absences');
const gratificationsRoutes = require('./routes/gratifications');
const employeUtilisateurRoutes = require('./routes/employe-utilisateur');
const deviceTokensRoutes = require('./routes/deviceTokens');
const nettoyageEspacesPublicsRoutes = require('./routes/nettoyage-espaces-publics');
const checkLingeRoutes = require('./routes/check-linge');
const nettoyageChambresRoutes = require('./routes/nettoyage-chambres');
const dispatchesHousekeepingRoutes = require('./routes/dispatches-housekeeping');
const pointagesRoutes = require('./routes/pointages');
const presencesDashboardRoutes = require('./routes/presences-dashboard');
const reportsRoutes = require('./routes/reports');
const suivisMaintenancesRoutes = require('./routes/suivis-maintenances');
const menusRoutes = require('./routes/menus');
const messagesRoutes = require('./routes/messages');
const plaintesRoutes = require('./routes/plaintes');
const ticketsProRoutes = require('./routes/tickets-pro');
const taskProRoutes = require('./routes/task-pro');
const commentairesTasksRoutes = require('./routes/commentaires-tasks');
const filesRoutes = require('./routes/files');
const circuitsRoutes = require('./routes/circuits');
const financesRoutes = require('./routes/finances');
const clientsRoutes = require('./routes/clients');
const redevancesMinesRoutes = require('./routes/redevances-mines');
const operateursMinesRoutes = require('./routes/operateurs-mines');
const titresPermisMinesRoutes = require('./routes/titres-permis-mines');
const inspectionsTerrainMinesRoutes = require('./routes/inspections-terrain-mines');
const tauxJourRoutes = require('./routes/taux-jour');
const parametresSysRoutes = require('./routes/parametres-sys');
const soumissionsBesoinsRoutes = require('./routes/soumissions-besoins');
const circuitsDepensesRoutes = require('./routes/circuits-depenses');
const guichetierSessionRoutes = require('./routes/guichetier-session');
const directionsProvincialesRoutes = require('./routes/directions-provinciales');
const bureauxInternationauxRoutes = require('./routes/bureaux-internationaux');
const zonesRoutes = require('./routes/zones');
const connaissementsRoutes = require('./routes/connaissements');
const assignationsBLRoutes = require('./routes/assignations-bl');
const assignationsBLControleurRoutes = require('./routes/assignations-bl-controleur');
const connexionsResponsablesRoutes = require('./routes/connexions-responsables');
const contentieuxDossiersRoutes = require('./routes/contentieux-dossiers');

const app = express();
app.set('trust proxy', 1); // Render / reverse proxy — rate limit par IP client réelle
// Socket.io for realtime notifications
const http = require('http').createServer(app);
const { Server } = require('socket.io');
const io = new Server(http, {
  cors: {
    origin: (origin, callback) => {
      if (isCorsOriginAllowed(origin)) return callback(null, true);
      return callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  },
  transports: ['websocket', 'polling'], // Forcer les transports disponibles
  allowEIO3: true // Compatibilité avec les anciennes versions
});
app.set('io', io);

// Socket.io connection handling for chat
io.use(async (socket, next) => {
  const { extractTokenFromCookieHeader } = require('./utils/authCookie');
  const token =
    socket.handshake.auth?.token ||
    socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '') ||
    extractTokenFromCookieHeader(socket.handshake.headers.cookie);

  if (!token) {
    return next(new Error('Authentication error'));
  }

  try {
    const jwt = require('jsonwebtoken');
    const User = require('./models/User');
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      return next(new Error('JWT_SECRET not configured'));
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId || decoded.id;
    const user = await User.findByPk(userId, {
      attributes: ['id', 'actif', 'token_version']
    });
    if (!user || !user.actif) {
      return next(new Error('Authentication error'));
    }
    if (Number(decoded.tv ?? 0) !== Number(user.token_version || 0)) {
      return next(new Error('Authentication error'));
    }
    socket.userId = userId;
    socket.user = decoded;
    next();
  } catch (err) {
    console.error('Socket.io authentication error:', err.message);
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  console.log(`✅ User ${socket.userId} connected to chat`);
  
  // Rejoindre la room de l'utilisateur
  socket.join(`user_${socket.userId}`);
  
  // Émettre l'événement de connexion
  socket.emit('connected', { userId: socket.userId });
  
  // Gérer la déconnexion
  socket.on('disconnect', () => {
    console.log(`❌ User ${socket.userId} disconnected from chat`);
  });
  
  // Gérer les erreurs
  socket.on('error', (error) => {
    console.error(`Socket error for user ${socket.userId}:`, error);
  });
});

const PORT = process.env.PORT || 5002;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for development
  crossOriginEmbedderPolicy: false
}));

// CORS en premier — les réponses 429 du rate limiter doivent inclure Access-Control-Allow-Origin
app.use(cors(corsOptions));

app.options('*', cors(corsOptions));

app.use(cookieParser());

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isCorsOriginAllowed(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-File-Name'
  );
  res.header('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  next();
});

function rateLimitWithCors(req, res, _next, options) {
  const origin = req.headers.origin;
  if (origin && typeof isCorsOriginAllowed === 'function' && isCorsOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (!origin) {
    /* same-origin / non-browser */
  }
  res.status(options.statusCode).json(options.message);
}

// Rate limiting — login strict, API générale plus permissive (évite déconnexions sous charge)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    error: 'Too many login attempts',
    message: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitWithCors
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    error: 'Too many reset attempts',
    message: 'Trop de demandes de réinitialisation. Réessayez dans quelques minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitWithCors
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 2500 : 2000,
  message: {
    error: 'Too many requests from this IP',
    message: 'Trop de requêtes depuis cette adresse IP. Réessayez dans quelques instants.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitWithCors,
  skip: (req) => {
    if (req.method === 'OPTIONS') return true;
    if (req.method === 'POST' && req.path === '/auth/login') return true;
    if (req.method === 'GET' && req.path === '/auth/me') return true;
    if (req.method === 'GET' && req.path === '/health') return true;
    if (req.method === 'GET' && req.path === '/connaissements') return true;
    if (req.method === 'GET' && req.path === '/assignations-bl') return true;
    if (req.method === 'GET' && req.path === '/assignations-bl-controleur') return true;
    if (req.method === 'GET' && req.path === '/dashboard/stats') return true;
    if (req.method === 'GET' && req.path === '/monitoring-phase-test/today') return true;
    if (
      req.method === 'GET' &&
      (/^\/connaissements\/\d+\/docs-(feri|zip|controle)$/.test(req.path) ||
        /^\/connaissements\/\d+\/docs$/.test(req.path) ||
        req.path === '/connaissements/docs-feri')
    ) {
      return true;
    }
    return false;
  }
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/forgot-password', forgotPasswordLimiter);
app.use('/api/', apiLimiter);

// Body parsing middleware with increased limits
app.use(express.json({ 
  limit: '50mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '50mb',
  parameterLimit: 1000
}));

// Request timeout middleware
app.use((req, res, next) => {
  req.setTimeout(30000); // 30 seconds
  res.setTimeout(30000);
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Static file serving — pas de listing ; types courants uniquement
app.use(
  '/uploads',
  express.static(path.join(__dirname, '../uploads'), {
    dotfiles: 'deny',
    index: false,
    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    }
  })
);

// API Routes with error handling
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chambres', roomRoutes);
app.use('/api/problematiques', issueRoutes);
app.use('/api/taches', taskRoutes);
app.use('/api/depenses', expenseRoutes);
app.use('/api/inventaire', inventoryRoutes);
app.use('/api/affectations', affectationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/fournisseurs', fournisseurRoutes);
app.use('/api/achats', achatRoutes);
app.use('/api/mouvements-stock', mouvementStockRoutes);
app.use('/api/entrepots', entrepotRoutes);
app.use('/api/caisses', caisseRoutes);
app.use('/api/paiements-salaires', paiementsRoutes);
app.use('/api/paiements', paiementsRoutes);
app.use('/api/encaissements', encaissementsRoutes);
app.use('/api/demandes', demandesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/demandes-affectation', demandesAffectationRoutes);
app.use('/api/departements', departementRoutes);
app.use('/api/sous-departements', sousDepartementRoutes);
app.use('/api/demandes-fonds', demandesFondsRoutes);
app.use('/api/fiches-execution', fichesExecutionRoutes);
app.use('/api/cycle-vie-articles', cycleVieArticlesRoutes);
app.use('/api/buanderie', buanderieRoutes);
app.use('/api/paiements-partiels', paiementsPartielsRoutes);
app.use('/api/rappels-paiement', rappelsPaiementRoutes);
app.use('/api/reset', resetRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/organigramme', organigrammeRoutes);
app.use('/api/bons-menage', bonsMenageRoutes);
app.use('/api/contrats', contratsRoutes);
app.use('/api/documents-rh', documentsRHRoutes);
app.use('/api/offres-emploi', offresEmploiRoutes);
app.use('/api/offres-emploi/public', offresEmploiPublicRoutes);
app.use('/api/dependants', dependantsRoutes);
app.use('/api/sanctions', sanctionsRoutes);
app.use('/api/sanctions-pro', sanctionsProRoutes);
app.use('/api/demandes-conges', demandesCongesRoutes);
app.use('/api/absences', absencesRoutes);
app.use('/api/gratifications', gratificationsRoutes);
app.use('/api/employe-utilisateur', employeUtilisateurRoutes);
app.use('/api/device-tokens', deviceTokensRoutes);
app.use('/api/nettoyage-espaces-publics', nettoyageEspacesPublicsRoutes);
app.use('/api/check-linge', checkLingeRoutes);
app.use('/api/nettoyage-chambres', nettoyageChambresRoutes);
app.use('/api/dispatches-housekeeping', dispatchesHousekeepingRoutes);
app.use('/api/pointages', pointagesRoutes);
app.use('/api/presences-dashboard', presencesDashboardRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/suivis-maintenances', suivisMaintenancesRoutes);
app.use('/api/menus', menusRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/plaintes', plaintesRoutes);
app.use('/api/tickets-pro', ticketsProRoutes);
app.use('/api/task-pro', taskProRoutes);
app.use('/api/commentaires-tasks', commentairesTasksRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/circuits', circuitsRoutes);
app.use('/api/finances', financesRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/mines/redevances', redevancesMinesRoutes);
app.use('/api/mines/operateurs', operateursMinesRoutes);
app.use('/api/mines/titres-permis', titresPermisMinesRoutes);
app.use('/api/mines/inspections-terrain', inspectionsTerrainMinesRoutes);
app.use('/api/taux-jour', tauxJourRoutes);
app.use('/api/parametres-sys', parametresSysRoutes);
app.use('/api/soumissions-besoins', soumissionsBesoinsRoutes);
app.use('/api/circuits-depenses', circuitsDepensesRoutes);
app.use('/api/guichetier', guichetierSessionRoutes);
app.use('/api/directions-provinciales', directionsProvincialesRoutes);
app.use('/api/bureaux-internationaux', bureauxInternationauxRoutes);
app.use('/api/zones', zonesRoutes);
app.use('/api/connaissements', connaissementsRoutes);
app.use('/api/bl-documents', connaissementsRoutes);
app.use('/api/assignations-bl', assignationsBLRoutes);
app.use('/api/assignations-bl-controleur', assignationsBLControleurRoutes);
app.use('/api/connexions-responsables', connexionsResponsablesRoutes);
app.use('/api/contentieux-dossiers', contentieuxDossiersRoutes);
app.use('/api/monitoring-phase-test', require('./routes/monitoring-phase-test'));
app.use('/api/tracking-dossier', require('./routes/tracking-dossier'));

// Vérification que les routes Mines sont chargées (répond 200 si le backend a bien redémarré)
app.get('/api/mines', (req, res) => res.json({ ok: true, message: 'Mines API (redevances, etc.)' }));

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    await sequelize.authenticate();
    res.json({ 
      status: 'OK', 
      message: 'SYNAPTA SYS is running',
      timestamp: new Date().toISOString(),
      database: 'Connected',
      uptime: process.uptime(),
      cors: {
        origin: req.headers.origin || 'No origin',
        environment: process.env.NODE_ENV || 'development',
        allowedOrigins: ['https://hotelbeatricesys.com', 'http://localhost:3000', 'http://localhost:3001']
      }
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'ERROR', 
      message: 'Database connection failed',
      timestamp: new Date().toISOString(),
      database: 'Disconnected',
      error: error.message
    });
  }
});

// CORS test endpoint
app.get('/api/cors-test', (req, res) => {
  res.json({
    message: 'CORS test successful',
    origin: req.headers.origin,
    timestamp: new Date().toISOString(),
    cors: {
      requestOrigin: req.headers.origin || 'No origin',
      environment: process.env.NODE_ENV || 'development',
      allowedOrigins: ['https://hotelbeatricesys.com', 'http://localhost:3000', 'http://localhost:3001'],
      isAllowed: ['https://hotelbeatricesys.com', 'http://localhost:3000', 'http://localhost:3001'].includes(req.headers.origin)
    }
  });
});

// Enhanced error handling middleware
app.use((err, req, res, next) => {
  console.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Handle Sequelize errors
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Erreur de validation des données',
      details: err.errors.map(e => ({
        field: e.path,
        message: e.message
      }))
    });
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      error: 'Duplicate Entry',
      message: 'Cette entrée existe déjà',
      field: err.errors[0]?.path
    });
  }

  if (err.name === 'SequelizeConnectionError') {
    return res.status(503).json({
      error: 'Database Connection Error',
      message: 'Erreur de connexion à la base de données'
    });
  }

  // Handle timeout errors
  if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
    return res.status(408).json({
      error: 'Request Timeout',
      message: 'La requête a pris trop de temps'
    });
  }

  // Default error response (never send null/undefined body)
  const status = err.status || 500;
  const body = {
    error: err.error || 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? (err.message || 'Erreur interne du serveur') : 'Erreur interne du serveur'
  };
  if (process.env.NODE_ENV === 'development' && err.stack) body.stack = err.stack;
  res.status(status).json(body);
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    message: 'Route non trouvée',
    path: req.originalUrl
  });
});

// Graceful shutdown handling
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown() {
  console.log('🛑 Received shutdown signal, closing server gracefully...');
  
  try {
    // Close database connection
    await sequelize.close();
    console.log('✅ Database connection closed.');
    
    // Exit process
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
}

// Unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process, just log the error
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown();
});

// Database connection and server start
async function startServer() {
  try {
    // Test database connection with retry
    let retries = 5;
    while (retries > 0) {
      try {
        await sequelize.authenticate();
        console.log('✅ Database connection established successfully.');
        break;
      } catch (error) {
        retries--;
        console.log(`❌ Database connection failed, retrying... (${retries} attempts left)`);
        if (retries === 0) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      }
    }
    
    // Configure database connection pool
    sequelize.connectionManager.config.pool = {
      max: 20, // Maximum number of connections
      min: 5,  // Minimum number of connections
      acquire: 60000, // Maximum time to acquire connection
      idle: 10000, // Maximum time connection can be idle
      evict: 1000, // How often to run eviction checks
      handleDisconnects: true
    };
    
    console.log('✅ Database connection ready with connection pooling.');

    try {
      const { ensureAuthUserColumns } = require('./utils/ensureAuthUserColumns');
      await ensureAuthUserColumns(sequelize);
    } catch (err) {
      console.warn('⚠️ ensureAuthUserColumns:', err.message);
    }

    // Créer tbl_taux_jour si absente (évite 503 sur PUT /api/taux-jour en production)
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS tbl_taux_jour (
          id INT NOT NULL AUTO_INCREMENT,
          date DATE NOT NULL,
          devise VARCHAR(5) NOT NULL,
          taux DECIMAL(18, 4) NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uk_taux_jour_date_devise (date, devise),
          KEY idx_taux_jour_date (date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `, { raw: true });
      console.log('✅ Table tbl_taux_jour prête.');
    } catch (err) {
      console.warn('⚠️ tbl_taux_jour:', err.message);
    }

    // Créer tbl_parametres_sys si absente (LONGTEXT pour compat MySQL 5.6+)
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS tbl_parametres_sys (
          id INT NOT NULL AUTO_INCREMENT,
          section VARCHAR(50) NOT NULL,
          data LONGTEXT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uk_parametres_sys_section (section)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `, { raw: true });
      console.log('✅ Table tbl_parametres_sys prête.');
    } catch (err) {
      console.warn('⚠️ tbl_parametres_sys:', err.message);
    }

    // Table clôture guichetier (une entrée par utilisateur par jour)
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS guichetier_clotures (
          id INT NOT NULL AUTO_INCREMENT,
          utilisateur_id INT NOT NULL,
          date_jour DATE NOT NULL,
          type ENUM('journee','shift') NOT NULL DEFAULT 'journee',
          closed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uk_guichetier_cloture_user_date (utilisateur_id, date_jour),
          KEY idx_guichetier_cloture_date (date_jour)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `, { raw: true });
      console.log('✅ Table guichetier_clotures prête.');
    } catch (err) {
      console.warn('⚠️ guichetier_clotures:', err.message);
    }

    // Directions provinciales & bureaux internationaux
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS tbl_directions_provinciales (
          id INT NOT NULL AUTO_INCREMENT,
          nom VARCHAR(200) NOT NULL,
          code VARCHAR(30) NULL,
          province VARCHAR(150) NULL,
          responsable_direction VARCHAR(255) NULL,
          email VARCHAR(255) NULL,
          telephone VARCHAR(50) NULL,
          adresse TEXT NULL,
          statut ENUM('Actif', 'Inactif') NOT NULL DEFAULT 'Actif',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uk_direction_provinciale_code (code),
          KEY idx_direction_prov_statut (statut)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `, { raw: true });
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS tbl_bureaux_internationaux (
          id INT NOT NULL AUTO_INCREMENT,
          nom VARCHAR(200) NOT NULL,
          code VARCHAR(30) NULL,
          pays VARCHAR(150) NULL,
          ville VARCHAR(150) NULL,
          responsable_bureau VARCHAR(255) NULL,
          email VARCHAR(255) NULL,
          telephone VARCHAR(50) NULL,
          adresse TEXT NULL,
          statut ENUM('Actif', 'Inactif') NOT NULL DEFAULT 'Actif',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uk_bureau_international_code (code),
          KEY idx_bureau_int_statut (statut)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `, { raw: true });
      console.log('✅ Tables directions provinciales & bureaux internationaux prêtes.');
    } catch (err) {
      console.warn('⚠️ tbl_directions_provinciales / tbl_bureaux_internationaux:', err.message);
    }

    // Créer tbl_soumissions_besoins et tbl_soumissions_besoins_lignes si absentes
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS tbl_soumissions_besoins (
          id INT NOT NULL AUTO_INCREMENT,
          type ENUM('materiel', 'fonds') NOT NULL,
          demandeur_id INT NOT NULL,
          superviseur_id INT NOT NULL,
          statut ENUM('en_attente', 'approuvee', 'rejetee', 'annulee') NOT NULL DEFAULT 'en_attente',
          motif TEXT,
          commentaire TEXT,
          montant_total DECIMAL(14, 2) NULL,
          devise ENUM('EUR', 'USD', 'FC') NULL DEFAULT 'FC',
          commentaire_superviseur TEXT,
          date_validation DATETIME NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_soumissions_besoins_demandeur (demandeur_id),
          KEY idx_soumissions_besoins_superviseur (superviseur_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `, { raw: true });
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS tbl_soumissions_besoins_lignes (
          id INT NOT NULL AUTO_INCREMENT,
          soumission_besoins_id INT NOT NULL,
          type_ligne ENUM('article', 'libelle') NOT NULL DEFAULT 'libelle',
          inventaire_id INT NULL,
          chambre_id INT NULL,
          libelle VARCHAR(255) NULL,
          montant DECIMAL(14, 2) NULL,
          quantite INT NULL DEFAULT 1,
          prix_unitaire DECIMAL(14, 2) NULL,
          devise ENUM('EUR', 'USD', 'FC') NULL DEFAULT 'FC',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_sb_lignes_soumission (soumission_besoins_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `, { raw: true });
      console.log('✅ Tables tbl_soumissions_besoins prêtes.');
    } catch (err) {
      console.warn('⚠️ tbl_soumissions_besoins:', err.message);
    }

    // Ajouter colonnes pièces justificatives si absentes (évite 500 GET /api/soumissions-besoins)
    const piecesCols = [
      ['piece_justificative_1_url', 'VARCHAR(512) NULL'],
      ['piece_justificative_1_nom', 'VARCHAR(255) NULL'],
      ['piece_justificative_2_url', 'VARCHAR(512) NULL'],
      ['piece_justificative_2_nom', 'VARCHAR(255) NULL'],
      ['piece_justificative_3_url', 'VARCHAR(512) NULL'],
      ['piece_justificative_3_nom', 'VARCHAR(255) NULL']
    ];
    for (const [colName, colDef] of piecesCols) {
      try {
        await sequelize.query(`ALTER TABLE tbl_soumissions_besoins ADD COLUMN \`${colName}\` ${colDef}`, { raw: true });
        console.log('✅ Colonne', colName, 'ajoutée.');
      } catch (err) {
        if (err.message && (err.message.includes('Duplicate column') || err.message.includes('already exists'))) {
          // déjà existant, ignorer
        } else {
          console.warn('⚠️ tbl_soumissions_besoins.', colName, ':', err.message);
        }
      }
    }

    // Colonnes workflow tbl_sanctions_pro (évite 500 GET /api/sanctions-pro en production)
    const sanctionsProWorkflowCols = [
      ['date_convocation', 'DATE NULL COMMENT \'Date d\\\'envoi convocation à entretien\''],
      ['date_entretien', 'DATE NULL COMMENT \'Date entretien disciplinaire\''],
      ['date_decision', 'DATE NULL COMMENT \'Date décision sanction\''],
      ['date_notification', 'DATE NULL COMMENT \'Date notification officielle\''],
      ['date_cloture', 'DATE NULL COMMENT \'Date clôture dossier\''],
      ['niveau_gravite', "ENUM('leger','moyen','grave','tres_grave') NULL COMMENT 'Niveau gravité'"],
      ['validation_direction_id', 'INT(11) NULL COMMENT \'ID utilisateur Direction si faute grave\'']
    ];
    for (const [colName, colDef] of sanctionsProWorkflowCols) {
      try {
        await sequelize.query(`ALTER TABLE tbl_sanctions_pro ADD COLUMN \`${colName}\` ${colDef}`, { raw: true });
        console.log('✅ tbl_sanctions_pro.', colName, 'ajouté.');
      } catch (err) {
        if (err.message && (err.message.includes('Duplicate column') || err.message.includes('already exists'))) {
          // déjà migré
        } else {
          console.warn('⚠️ tbl_sanctions_pro.', colName, ':', err.message);
        }
      }
    }
    // Étendre l'ENUM statut si nécessaire (ignorer si déjà à jour)
    try {
      await sequelize.query(`
        ALTER TABLE tbl_sanctions_pro MODIFY COLUMN statut ENUM(
          'en_attente','approuve','rejete','annule',
          'en_analyse_rh','classement_sans_suite','convocation_envoyee','entretien_realise',
          'sanction_validee','sanction_notifiee','dossier_cloture'
        ) NOT NULL DEFAULT 'en_attente'
      `, { raw: true });
      console.log('✅ tbl_sanctions_pro statut ENUM à jour.');
    } catch (err) {
      if (err.message && !err.message.includes('Duplicate')) console.warn('⚠️ tbl_sanctions_pro statut:', err.message);
    }

    // tbl_contentieux_dossiers (contentieux FERI)
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS tbl_contentieux_dossiers (
          id INT(11) NOT NULL AUTO_INCREMENT,
          connaissement_id INT(11) NOT NULL,
          numero_dossier VARCHAR(255) NOT NULL,
          bl_number VARCHAR(50) DEFAULT NULL,
          saisisseur_id INT(11) DEFAULT NULL,
          saisisseur_nom VARCHAR(255) DEFAULT NULL,
          cree_par_id INT(11) NOT NULL,
          statut ENUM('Nouveau','En cours','Clôturé','Annulé') NOT NULL DEFAULT 'Nouveau',
          commentaire TEXT DEFAULT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_contentieux_connaissement (connaissement_id),
          KEY idx_contentieux_numero_dossier (numero_dossier),
          KEY idx_contentieux_cree_par (cree_par_id),
          KEY idx_contentieux_statut (statut),
          KEY idx_contentieux_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `, { raw: true });
      console.log('✅ Table tbl_contentieux_dossiers prête.');
    } catch (err) {
      console.warn('⚠️ tbl_contentieux_dossiers:', err.message);
    }

    // Démarrer le service de monitoring des stocks
    const stockMonitoringService = require('./services/stockMonitoringService');
    const monitoringInterval = parseInt(process.env.STOCK_MONITORING_INTERVAL || '60000', 10); // 1 minute par défaut
    stockMonitoringService.startMonitoring(monitoringInterval);
    console.log(`📊 Service de monitoring des stocks démarré (intervalle: ${monitoringInterval / 1000}s)`);
    
    const server = http.listen(PORT, () => {
      console.log(`🚀 SYNAPTA SYS running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
      console.log(`💾 Database: ${sequelize.getDatabaseName()}`);
      console.log(`👥 Max connections: ${sequelize.connectionManager.config.pool.max}`);
      
      // Alert system removed
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.syscall !== 'listen') {
        throw error;
      }

      switch (error.code) {
        case 'EACCES':
          console.error(`❌ Port ${PORT} requires elevated privileges`);
          process.exit(1);
          break;
        case 'EADDRINUSE':
          console.error(`❌ Port ${PORT} is already in use`);
          process.exit(1);
          break;
        default:
          throw error;
      }
    });

    // Handle connection errors
    server.on('connection', (socket) => {
      socket.setTimeout(30000); // 30 seconds timeout
    });

  } catch (error) {
    console.error('❌ Unable to start server:', error);
    process.exit(1);
  }
}

startServer(); 
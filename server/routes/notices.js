/**
 * /api/notices — Notice board.
 *
 * L’Administrateur publie un message destiné à tous, à un ou plusieurs bureaux internationaux,
 * à un ou plusieurs profils (rôles) ou à des utilisateurs précis. Les destinataires le voient
 * s’afficher en popup (avec bip) dès qu’ils sont connectés, jusqu’à ce qu’ils confirment l’avoir lu.
 */
const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const Notice = require('../models/Notice');
const NoticeLecture = require('../models/NoticeLecture');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const { isRoleAdministrateur } = require('../utils/userRoles');

const router = express.Router();
router.use(authenticateToken);

const CIBLE_TYPES = ['tous', 'bureau', 'role', 'utilisateurs'];
const NIVEAUX = ['info', 'important', 'urgent'];

function validationMessage(errors) {
  const first = errors.array()[0];
  return first?.msg && first.msg !== 'Invalid value'
    ? first.msg
    : `Données invalides : ${[...new Set(errors.array().map((e) => e.path))].join(', ')}.`;
}

function requireAdmin(req, res, next) {
  if (!isRoleAdministrateur(req.user?.role)) {
    return res.status(403).json({ success: false, message: 'Réservé à l’Administrateur.' });
  }
  return next();
}

function parseList(raw) {
  let v = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      v = [];
    }
  }
  return Array.isArray(v) ? v : [];
}

function intList(raw) {
  return [...new Set(parseList(raw).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0))];
}

function strList(raw) {
  return [...new Set(parseList(raw).map((x) => String(x || '').trim()).filter(Boolean))];
}

/** La notice vise-t-elle cet utilisateur ? (user : { id, role, bureau_international_id }) */
function noticeTargetsUser(notice, user) {
  switch (notice.cibleType) {
    case 'tous':
      return true;
    case 'bureau':
      return intList(notice.cibleBureauIds).includes(Number(user.bureau_international_id));
    case 'role':
      return strList(notice.cibleRoles).includes(String(user.role || '').trim());
    case 'utilisateurs':
      return intList(notice.cibleUserIds).includes(Number(user.id));
    default:
      return false;
  }
}

/** Where Sequelize : notices publiées et dans leur période. */
function activeNoticeWhere(now = new Date()) {
  return {
    actif: true,
    dateDebut: { [Op.lte]: now },
    [Op.or]: [{ dateFin: null }, { dateFin: { [Op.gte]: now } }]
  };
}

/** Utilisateurs (actifs) visés par une notice. */
async function findTargetUsers(notice) {
  const where = { actif: true };
  switch (notice.cibleType) {
    case 'tous':
      break;
    case 'bureau':
      where.bureau_international_id = { [Op.in]: intList(notice.cibleBureauIds).concat(-1) };
      break;
    case 'role':
      where.role = { [Op.in]: strList(notice.cibleRoles).concat('__none__') };
      break;
    case 'utilisateurs':
      where.id = { [Op.in]: intList(notice.cibleUserIds).concat(-1) };
      break;
    default:
      return [];
  }
  return User.findAll({ where, attributes: ['id', 'nom', 'prenom', 'email', 'role', 'bureau_international_id'] });
}

function noticeStatus(n, now = new Date()) {
  if (!n.actif) return 'desactivee';
  if (new Date(n.dateDebut) > now) return 'programmee';
  if (n.dateFin && new Date(n.dateFin) < now) return 'expiree';
  return 'active';
}

function serializeNotice(n, extra = {}) {
  const json = typeof n.toJSON === 'function' ? n.toJSON() : { ...n };
  return {
    ...json,
    cibleBureauIds: intList(n.cibleBureauIds),
    cibleRoles: strList(n.cibleRoles),
    cibleUserIds: intList(n.cibleUserIds),
    statut: noticeStatus(n),
    ...extra
  };
}

/** Prévient en temps réel les destinataires d’une notice active (le client recharge ses notices). */
async function broadcastNotice(req, notice) {
  const io = req.app && typeof req.app.get === 'function' ? req.app.get('io') : null;
  if (!io || noticeStatus(notice) !== 'active') return;
  const payload = { id: notice.id, at: new Date().toISOString() };
  if (notice.cibleType === 'tous') {
    io.emit('notice:new', payload);
    return;
  }
  const users = await findTargetUsers(notice);
  users.forEach((u) => io.to(`user_${u.id}`).emit('notice:new', payload));
}

/* ------------------------------------------------------------------ */
/* Destinataire                                                         */
/* ------------------------------------------------------------------ */

// GET /api/notices/me/pending — notices actives qui me visent et que je n’ai pas encore lues
router.get('/me/pending', async (req, res) => {
  try {
    const me = await User.findByPk(req.user.id, { attributes: ['id', 'role', 'bureau_international_id'] });
    if (!me) return res.json({ success: true, notices: [] });

    const read = await NoticeLecture.findAll({ where: { userId: me.id }, attributes: ['noticeId'] });
    const readIds = read.map((r) => r.noticeId);

    const where = activeNoticeWhere();
    if (readIds.length) where.id = { [Op.notIn]: readIds };

    const candidates = await Notice.findAll({
      where,
      include: [{ model: User, as: 'creePar', attributes: ['id', 'nom', 'prenom'] }],
      order: [['dateDebut', 'ASC'], ['id', 'ASC']],
      limit: 50
    });
    const notices = candidates.filter((n) => noticeTargetsUser(n, me)).map((n) => serializeNotice(n));
    return res.json({ success: true, notices });
  } catch (error) {
    console.error('GET /notices/me/pending', error);
    return res.status(500).json({ success: false, message: 'Erreur lors du chargement des notices.' });
  }
});

// POST /api/notices/:id/lu — « J’ai lu »
router.post('/:id/lu', [param('id').isInt({ min: 1 })], async (req, res) => {
  try {
    const notice = await Notice.findByPk(req.params.id);
    if (!notice) return res.status(404).json({ success: false, message: 'Notice introuvable.' });
    await NoticeLecture.findOrCreate({
      where: { noticeId: notice.id, userId: req.user.id },
      defaults: { luLe: new Date() }
    });
    return res.json({ success: true });
  } catch (error) {
    console.error('POST /notices/:id/lu', error);
    return res.status(500).json({ success: false, message: 'Erreur lors de l’accusé de lecture.' });
  }
});

/* ------------------------------------------------------------------ */
/* Administrateur                                                       */
/* ------------------------------------------------------------------ */

// GET /api/notices — toutes les notices avec statistiques de lecture
router.get('/', requireAdmin, async (req, res) => {
  try {
    const notices = await Notice.findAll({
      include: [{ model: User, as: 'creePar', attributes: ['id', 'nom', 'prenom'] }],
      order: [['created_at', 'DESC']],
      limit: 300
    });
    const ids = notices.map((n) => n.id);
    const readCounts = ids.length
      ? await NoticeLecture.findAll({
          where: { noticeId: { [Op.in]: ids } },
          attributes: ['noticeId', [NoticeLecture.sequelize.fn('COUNT', NoticeLecture.sequelize.col('id')), 'n']],
          group: ['noticeId'],
          raw: true
        })
      : [];
    const readMap = new Map(readCounts.map((r) => [Number(r.noticeId), Number(r.n)]));

    const result = await Promise.all(
      notices.map(async (n) => {
        const targets = await findTargetUsers(n);
        return serializeNotice(n, { destinatairesCount: targets.length, lecturesCount: readMap.get(n.id) || 0 });
      })
    );
    return res.json({ success: true, notices: result });
  } catch (error) {
    console.error('GET /notices', error);
    return res.status(500).json({ success: false, message: 'Erreur lors du chargement des notices.' });
  }
});

// GET /api/notices/:id/lectures — qui a lu / qui n’a pas encore lu
router.get('/:id/lectures', requireAdmin, [param('id').isInt({ min: 1 })], async (req, res) => {
  try {
    const notice = await Notice.findByPk(req.params.id);
    if (!notice) return res.status(404).json({ success: false, message: 'Notice introuvable.' });
    const [targets, lectures] = await Promise.all([
      findTargetUsers(notice),
      NoticeLecture.findAll({ where: { noticeId: notice.id }, attributes: ['userId', 'luLe'] })
    ]);
    const readAt = new Map(lectures.map((l) => [Number(l.userId), l.luLe]));
    const users = targets
      .map((u) => ({
        id: u.id,
        nom: u.nom,
        prenom: u.prenom,
        email: u.email,
        role: u.role,
        luLe: readAt.get(Number(u.id)) || null
      }))
      .sort((a, b) => (a.luLe ? 1 : 0) - (b.luLe ? 1 : 0) || `${a.nom}`.localeCompare(`${b.nom}`));
    return res.json({ success: true, users });
  } catch (error) {
    console.error('GET /notices/:id/lectures', error);
    return res.status(500).json({ success: false, message: 'Erreur lors du chargement des lectures.' });
  }
});

const NOTICE_VALIDATORS = [
  body('titre').trim().isLength({ min: 3, max: 200 }).withMessage('Titre requis (3 à 200 caractères).'),
  body('message').trim().isLength({ min: 3, max: 10000 }).withMessage('Message requis (3 à 10 000 caractères).'),
  body('niveau').optional().isIn(NIVEAUX),
  body('cible_type').isIn(CIBLE_TYPES).withMessage('Destinataires invalides.'),
  body('cible_bureau_ids').optional({ nullable: true }).isArray(),
  body('cible_roles').optional({ nullable: true }).isArray(),
  body('cible_user_ids').optional({ nullable: true }).isArray(),
  body('date_debut').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Date de début invalide.'),
  body('date_fin').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Date de fin invalide.')
];

function buildNoticeValues(req) {
  const cibleType = req.body.cible_type;
  const cibleBureauIds = cibleType === 'bureau' ? intList(req.body.cible_bureau_ids) : null;
  const cibleRoles = cibleType === 'role' ? strList(req.body.cible_roles) : null;
  const cibleUserIds = cibleType === 'utilisateurs' ? intList(req.body.cible_user_ids) : null;
  if (cibleType === 'bureau' && !cibleBureauIds.length) return { error: 'Choisissez au moins un bureau.' };
  if (cibleType === 'role' && !cibleRoles.length) return { error: 'Choisissez au moins un profil.' };
  if (cibleType === 'utilisateurs' && !cibleUserIds.length) return { error: 'Choisissez au moins un utilisateur.' };

  const dateDebut = req.body.date_debut ? new Date(req.body.date_debut) : new Date();
  const dateFin = req.body.date_fin ? new Date(req.body.date_fin) : null;
  if (dateFin && dateFin <= dateDebut) return { error: 'La date de fin doit être après la date de début.' };

  return {
    values: {
      titre: String(req.body.titre).trim(),
      message: String(req.body.message).trim(),
      niveau: NIVEAUX.includes(req.body.niveau) ? req.body.niveau : 'info',
      cibleType,
      cibleBureauIds,
      cibleRoles,
      cibleUserIds,
      dateDebut,
      dateFin
    }
  };
}

// POST /api/notices — publier
router.post('/', requireAdmin, NOTICE_VALIDATORS, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: validationMessage(errors) });
    const { error, values } = buildNoticeValues(req);
    if (error) return res.status(400).json({ success: false, message: error });

    const notice = await Notice.create({ ...values, actif: true, creeParId: req.user.id });
    const targets = await findTargetUsers(notice);
    broadcastNotice(req, notice).catch((err) => console.error('[notices] diffusion échouée:', err.message));

    return res.status(201).json({
      success: true,
      notice: serializeNotice(notice, { destinatairesCount: targets.length, lecturesCount: 0 })
    });
  } catch (error) {
    console.error('POST /notices', error);
    return res.status(500).json({ success: false, message: 'Erreur lors de la publication de la notice.' });
  }
});

// PUT /api/notices/:id — modifier (les accusés de lecture sont conservés sauf si reset_lectures=true)
router.put('/:id', requireAdmin, [param('id').isInt({ min: 1 }), ...NOTICE_VALIDATORS], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: validationMessage(errors) });
    const notice = await Notice.findByPk(req.params.id);
    if (!notice) return res.status(404).json({ success: false, message: 'Notice introuvable.' });

    const { error, values } = buildNoticeValues(req);
    if (error) return res.status(400).json({ success: false, message: error });

    await notice.update(values);
    if (req.body.reset_lectures === true) {
      await NoticeLecture.destroy({ where: { noticeId: notice.id } });
    }
    broadcastNotice(req, notice).catch((err) => console.error('[notices] diffusion échouée:', err.message));
    return res.json({ success: true, notice: serializeNotice(notice) });
  } catch (error) {
    console.error('PUT /notices/:id', error);
    return res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour de la notice.' });
  }
});

// PATCH /api/notices/:id/actif — activer / désactiver
router.patch('/:id/actif', requireAdmin, [param('id').isInt({ min: 1 }), body('actif').isBoolean()], async (req, res) => {
  try {
    const notice = await Notice.findByPk(req.params.id);
    if (!notice) return res.status(404).json({ success: false, message: 'Notice introuvable.' });
    await notice.update({ actif: req.body.actif === true || req.body.actif === 'true' });
    if (notice.actif) {
      broadcastNotice(req, notice).catch((err) => console.error('[notices] diffusion échouée:', err.message));
    }
    return res.json({ success: true, notice: serializeNotice(notice) });
  } catch (error) {
    console.error('PATCH /notices/:id/actif', error);
    return res.status(500).json({ success: false, message: 'Erreur lors du changement de statut.' });
  }
});

// DELETE /api/notices/:id
router.delete('/:id', requireAdmin, [param('id').isInt({ min: 1 })], async (req, res) => {
  try {
    const notice = await Notice.findByPk(req.params.id);
    if (!notice) return res.status(404).json({ success: false, message: 'Notice introuvable.' });
    await NoticeLecture.destroy({ where: { noticeId: notice.id } });
    await notice.destroy();
    return res.json({ success: true });
  } catch (error) {
    console.error('DELETE /notices/:id', error);
    return res.status(500).json({ success: false, message: 'Erreur lors de la suppression.' });
  }
});

module.exports = router;

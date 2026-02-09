const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const ParametresSys = require('../models/ParametresSys');

const SECTIONS = ['general', 'societe', 'finances', 'facturation', 'affichage'];

const DEFAULTS = {
  general: {
    nom_systeme: 'SYNAPTA SYS',
    description: 'Système de gestion intégré',
    langue_defaut: 'Français',
    fuseau_horaire: 'Africa/Kinshasa',
    format_date: 'DD/MM/YYYY',
    format_heure: '24h'
  },
  societe: {
    raison_sociale: 'SYNAPTA',
    adresse: '—',
    ville: '—',
    pays: 'RDC',
    telephone: '—',
    email: '—',
    site_web: '—',
    numero_nif: '—',
    numero_rc: '—'
  },
  finances: {
    devise_principale: 'FC',
    devise_secondaire: 'USD',
    taux_usd_fc: 2200,
    symbole_devise: 'FC',
    tva_par_defaut: 16,
    decimales_montants: 2
  },
  facturation: {
    prefixe_facture: 'FAC',
    modele_facture_defaut: 'Moderne',
    delai_echeance_jours: 30,
    mentions_legales: '—'
  },
  affichage: {
    logo_url: '',
    nom_rapports: 'SYNAPTA SYS',
    pied_de_page_rapports: 'Document généré par SYNAPTA SYS'
  }
};

function isTableMissing(err) {
  if (!err) return false;
  const msg = [err.message, err.original && err.original.message].filter(Boolean).join(' ');
  return /doesn't exist|ER_NO_SUCH_TABLE|Unknown table/i.test(msg);
}

const router = express.Router();
router.use(authenticateToken);

// GET /api/parametres-sys — tous les paramètres (fusion DB + défauts)
router.get('/', async (req, res) => {
  try {
    const rows = await ParametresSys.findAll({ raw: true });
    const out = {};
    SECTIONS.forEach(s => {
      out[s] = { ...DEFAULTS[s] };
    });
    rows.forEach(r => {
      if (SECTIONS.includes(r.section) && r.data && typeof r.data === 'object') {
        out[r.section] = { ...out[r.section], ...r.data };
      }
    });
    return res.json(out);
  } catch (err) {
    if (isTableMissing(err)) return res.json(DEFAULTS);
    console.error('Parametres-sys GET:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/parametres-sys — met à jour une section (body: { section, data })
router.put('/', [
  body('section').isIn(SECTIONS).withMessage('section invalide'),
  body('data').isObject().withMessage('data requis (objet)')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    const { section, data } = req.body;
    const merged = { ...DEFAULTS[section], ...data };
    const [row] = await ParametresSys.findOrCreate({
      where: { section },
      defaults: { data: merged }
    });
    await row.update({ data: merged });
    return res.json({ section, data: merged });
  } catch (err) {
    if (isTableMissing(err)) {
      return res.status(503).json({
        message: 'Table des paramètres non configurée. Exécutez la migration tbl_parametres_sys.',
        tableMissing: true
      });
    }
    console.error('Parametres-sys PUT:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;

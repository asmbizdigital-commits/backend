const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { Op } = require('sequelize');
const { authenticateToken } = require('../middleware/auth');
const CompteFin = require('../models/CompteFin');
const JournalFin = require('../models/JournalFin');
const EcritureFin = require('../models/EcritureFin');
const LigneEcritureFin = require('../models/LigneEcritureFin');
const BudgetFin = require('../models/BudgetFin');
const LigneBudgetFin = require('../models/LigneBudgetFin');
const FactureFin = require('../models/FactureFin');
const LigneFactureFin = require('../models/LigneFactureFin');
const User = require('../models/User');
const Client = require('../models/Client');
const { sequelize } = require('../config/database');
const pdfService = require('../services/pdfService');

// Taux de conversion USD → FC pour les écritures comptables (factures en dollars)
const TAUX_USD_FC = Number(process.env.TAUX_USD_FC) || 2200;

const router = express.Router();
router.use(authenticateToken);

// --- Plan comptable (comptes) ---
// GET /api/finances/comptes
router.get('/comptes', [
  query('type_compte').optional().isIn(['actif', 'passif', 'charge', 'produit', 'tresorerie']),
  query('actif').optional().isIn(['true', 'false']),
  query('search').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    const where = {};
    if (req.query.type_compte) where.type_compte = req.query.type_compte;
    if (req.query.actif !== undefined) where.actif = req.query.actif === 'true';
    if (req.query.search) {
      where[Op.or] = [
        { code: { [Op.like]: `%${req.query.search}%` } },
        { libelle: { [Op.like]: `%${req.query.search}%` } }
      ];
    }
    const comptes = await CompteFin.findAll({
      where,
      order: [['code', 'ASC']],
      include: [{ model: CompteFin, as: 'parent', attributes: ['id', 'code', 'libelle'] }]
    });
    return res.json({ data: comptes });
  } catch (err) {
    console.error('Finances comptes list:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/finances/comptes
router.post('/comptes', [
  body('code').trim().notEmpty().withMessage('Code requis'),
  body('libelle').trim().notEmpty().withMessage('Libellé requis'),
  body('type_compte').isIn(['actif', 'passif', 'charge', 'produit', 'tresorerie']).withMessage('Type invalide'),
  body('parent_id').optional().isInt(),
  body('solde_ouverture').optional().isFloat(),
  body('devise').optional().isString().isLength({ max: 5 }),
  body('actif').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    const compte = await CompteFin.create({
      code: req.body.code,
      libelle: req.body.libelle,
      type_compte: req.body.type_compte,
      parent_id: req.body.parent_id || null,
      solde_ouverture: parseFloat(req.body.solde_ouverture) || 0,
      devise: req.body.devise || 'FC',
      actif: req.body.actif !== false
    });
    return res.status(201).json({ data: compte });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ message: 'Ce code de compte existe déjà' });
    console.error('Finances compte create:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/finances/comptes/:id
router.put('/comptes/:id', [
  body('code').optional().trim().notEmpty(),
  body('libelle').optional().trim().notEmpty(),
  body('type_compte').optional().isIn(['actif', 'passif', 'charge', 'produit', 'tresorerie']),
  body('parent_id').optional().isInt(),
  body('solde_ouverture').optional().isFloat(),
  body('devise').optional().isString().isLength({ max: 5 }),
  body('actif').optional().isBoolean()
], async (req, res) => {
  try {
    const compte = await CompteFin.findByPk(req.params.id);
    if (!compte) return res.status(404).json({ message: 'Compte non trouvé' });
    await compte.update({
      ...(req.body.code !== undefined && { code: req.body.code }),
      ...(req.body.libelle !== undefined && { libelle: req.body.libelle }),
      ...(req.body.type_compte !== undefined && { type_compte: req.body.type_compte }),
      ...(req.body.parent_id !== undefined && { parent_id: req.body.parent_id || null }),
      ...(req.body.solde_ouverture !== undefined && { solde_ouverture: parseFloat(req.body.solde_ouverture) }),
      ...(req.body.devise !== undefined && { devise: req.body.devise }),
      ...(req.body.actif !== undefined && { actif: req.body.actif })
    });
    return res.json({ data: compte });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ message: 'Ce code de compte existe déjà' });
    console.error('Finances compte update:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// DELETE /api/finances/comptes/:id
router.delete('/comptes/:id', async (req, res) => {
  try {
    const compte = await CompteFin.findByPk(req.params.id);
    if (!compte) return res.status(404).json({ message: 'Compte non trouvé' });
    const used = await LigneEcritureFin.count({ where: { compte_id: compte.id } });
    if (used > 0) return res.status(400).json({ message: 'Ce compte est utilisé dans des écritures, suppression impossible' });
    await compte.destroy();
    return res.json({ message: 'Compte supprimé' });
  } catch (err) {
    console.error('Finances compte delete:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/finances/comptes/:compteId/journal — mouvements du compte (au quotidien)
router.get('/comptes/:compteId/journal', [
  query('date_debut').optional().isDate(),
  query('date_fin').optional().isDate(),
  query('valide').optional().isIn(['true', 'false'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    const compte = await CompteFin.findByPk(req.params.compteId);
    if (!compte) return res.status(404).json({ message: 'Compte non trouvé' });
    const whereLigne = { compte_id: compte.id };
    const whereEcriture = {};
    if (req.query.valide !== undefined) whereEcriture.valide = req.query.valide === 'true';
    if (req.query.date_debut || req.query.date_fin) {
      whereEcriture.date_ecriture = {};
      if (req.query.date_debut) whereEcriture.date_ecriture[Op.gte] = req.query.date_debut;
      if (req.query.date_fin) whereEcriture.date_ecriture[Op.lte] = req.query.date_fin;
    }
    const lignes = await LigneEcritureFin.findAll({
      where: whereLigne,
      include: [
        { model: EcritureFin, as: 'ecriture', where: whereEcriture, required: true, include: [{ model: JournalFin, as: 'journal', attributes: ['id', 'code', 'libelle'] }] }
      ]
    });
    lignes.sort((a, b) => {
      const da = a.ecriture?.date_ecriture || '';
      const db = b.ecriture?.date_ecriture || '';
      if (da !== db) return da.localeCompare(db);
      return (a.ecriture?.id || 0) - (b.ecriture?.id || 0) || (a.ordre || 0) - (b.ordre || 0);
    });
    const soldeOuverture = parseFloat(compte.solde_ouverture || 0);
    const typeCompte = (compte.type_compte || 'actif').toString().toLowerCase();
    // Comptes à solde débiteur : actif, charge, trésorerie (classe 5) — un débit augmente le solde
    const isDebitSolde = typeCompte === 'actif' || typeCompte === 'charge' || typeCompte === 'tresorerie';
    let soldeCumul = soldeOuverture;
    const rows = lignes.map((l) => {
      const debit = parseFloat(l.debit || 0);
      const credit = parseFloat(l.credit || 0);
      const mouvement = isDebitSolde ? debit - credit : credit - debit;
      soldeCumul += mouvement;
      return {
        id: l.id,
        date: l.ecriture?.date_ecriture,
        ecriture_id: l.ecriture_id,
        numero_piece: l.ecriture?.numero_piece,
        journal_code: l.ecriture?.journal?.code,
        journal_libelle: l.ecriture?.journal?.libelle,
        libelle: l.libelle_ligne || l.ecriture?.libelle || '',
        debit,
        credit,
        solde_cumul: Math.round(soldeCumul * 100) / 100
      };
    });
    const byDay = {};
    rows.forEach((r) => {
      const d = (r.date || '').toString().slice(0, 10);
      if (!byDay[d]) byDay[d] = [];
      byDay[d].push(r);
    });
    return res.json({
      data: {
        compte: { id: compte.id, code: compte.code, libelle: compte.libelle, type_compte: compte.type_compte, devise: compte.devise, solde_ouverture: soldeOuverture },
        lignes: rows,
        par_jour: byDay
      }
    });
  } catch (err) {
    console.error('Finances compte journal:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// --- Journaux ---
// GET /api/finances/journaux
router.get('/journaux', async (req, res) => {
  try {
    const journaux = await JournalFin.findAll({ where: { actif: true }, order: [['code', 'ASC']] });
    return res.json({ data: journaux });
  } catch (err) {
    console.error('Finances journaux list:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// --- Écritures ---
function generateNumeroPiece(journalCode) {
  const y = new Date().getFullYear();
  const prefix = `${journalCode}-${y}-`;
  return prefix; // appelant fera le count + 1
}

// GET /api/finances/ecritures
router.get('/ecritures', [
  query('journal_id').optional().isInt(),
  query('valide').optional().isIn(['true', 'false']),
  query('date_debut').optional().isDate(),
  query('date_fin').optional().isDate(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    const where = {};
    if (req.query.journal_id) where.journal_id = parseInt(req.query.journal_id);
    if (req.query.valide !== undefined) where.valide = req.query.valide === 'true';
    if (req.query.date_debut || req.query.date_fin) {
      where.date_ecriture = {};
      if (req.query.date_debut) where.date_ecriture[Op.gte] = req.query.date_debut;
      if (req.query.date_fin) where.date_ecriture[Op.lte] = req.query.date_fin;
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const { count, rows } = await EcritureFin.findAndCountAll({
      where,
      include: [
        { model: JournalFin, as: 'journal', attributes: ['id', 'code', 'libelle', 'type_journal'] },
        { model: User, as: 'createur', attributes: ['id', 'nom', 'prenom'] },
        { model: LigneEcritureFin, as: 'lignes', include: [{ model: CompteFin, as: 'compte', attributes: ['id', 'code', 'libelle', 'type_compte', 'devise'] }] }
      ],
      order: [['date_ecriture', 'DESC'], ['id', 'DESC']],
      limit,
      offset
    });
    return res.json({ data: rows, pagination: { page, limit, total: count, pages: Math.ceil(count / limit) } });
  } catch (err) {
    console.error('Finances ecritures list:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/finances/ecritures/next-numero?journal_id=1
router.get('/ecritures/next-numero', [query('journal_id').isInt()], async (req, res) => {
  try {
    const journal = await JournalFin.findByPk(req.query.journal_id);
    if (!journal) return res.status(404).json({ message: 'Journal non trouvé' });
    const y = new Date().getFullYear();
    const prefix = `${journal.code}-${y}-`;
    const count = await EcritureFin.count({
      where: { journal_id: journal.id, numero_piece: { [Op.like]: `${prefix}%` } }
    });
    const numero = `${prefix}${String(count + 1).padStart(4, '0')}`;
    return res.json({ numero });
  } catch (err) {
    console.error('Finances next-numero:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/finances/ecritures/:id
router.get('/ecritures/:id', async (req, res) => {
  try {
    const ecriture = await EcritureFin.findByPk(req.params.id, {
      include: [
        { model: JournalFin, as: 'journal', attributes: ['id', 'code', 'libelle', 'type_journal'] },
        { model: User, as: 'createur', attributes: ['id', 'nom', 'prenom'] },
        { model: LigneEcritureFin, as: 'lignes', order: [['ordre', 'ASC'], ['id', 'ASC']], include: [{ model: CompteFin, as: 'compte', attributes: ['id', 'code', 'libelle', 'type_compte', 'devise'] }] }
      ]
    });
    if (!ecriture) return res.status(404).json({ message: 'Écriture non trouvée' });
    return res.json({ data: ecriture });
  } catch (err) {
    console.error('Finances ecriture get:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/finances/ecritures
router.post('/ecritures', [
  body('journal_id').isInt().withMessage('Journal requis'),
  body('numero_piece').trim().notEmpty().withMessage('Numéro de pièce requis'),
  body('date_ecriture').isDate().withMessage('Date requise'),
  body('libelle').trim().notEmpty().withMessage('Libellé requis'),
  body('reference_externe').optional().trim(),
  body('valide').optional().isBoolean(),
  body('lignes').isArray().withMessage('Lignes requises'),
  body('lignes.*.compte_id').isInt(),
  body('lignes.*.libelle_ligne').optional().trim(),
  body('lignes.*.debit').optional().isFloat({ min: 0 }),
  body('lignes.*.credit').optional().isFloat({ min: 0 }),
  body('lignes.*.ordre').optional().isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    const lignes = req.body.lignes || [];
    const totalDebit = lignes.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
    const totalCredit = lignes.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) return res.status(400).json({ message: 'Débit et crédit doivent être équilibrés' });
    const ecriture = await EcritureFin.create({
      journal_id: req.body.journal_id,
      numero_piece: req.body.numero_piece,
      date_ecriture: req.body.date_ecriture,
      libelle: req.body.libelle,
      reference_externe: req.body.reference_externe || null,
      valide: req.body.valide === true,
      created_by: req.user.id
    });
    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i];
      await LigneEcritureFin.create({
        ecriture_id: ecriture.id,
        compte_id: l.compte_id,
        libelle_ligne: l.libelle_ligne || null,
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
        ordre: l.ordre != null ? l.ordre : i
      });
    }
    const created = await EcritureFin.findByPk(ecriture.id, {
      include: [
        { model: JournalFin, as: 'journal' },
        { model: User, as: 'createur', attributes: ['id', 'nom', 'prenom'] },
        { model: LigneEcritureFin, as: 'lignes', include: [{ model: CompteFin, as: 'compte' }] }
      ]
    });
    return res.status(201).json({ data: created });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ message: 'Ce numéro de pièce existe déjà' });
    console.error('Finances ecriture create:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/finances/ecritures/:id
router.put('/ecritures/:id', [
  body('numero_piece').optional().trim().notEmpty(),
  body('date_ecriture').optional().isDate(),
  body('libelle').optional().trim().notEmpty(),
  body('reference_externe').optional().trim(),
  body('valide').optional().isBoolean(),
  body('lignes').optional().isArray()
], async (req, res) => {
  try {
    const ecriture = await EcritureFin.findByPk(req.params.id, { include: [{ model: LigneEcritureFin, as: 'lignes' }] });
    if (!ecriture) return res.status(404).json({ message: 'Écriture non trouvée' });
    if (ecriture.valide) return res.status(400).json({ message: 'Une écriture validée ne peut pas être modifiée' });
    const updates = {};
    if (req.body.numero_piece !== undefined) updates.numero_piece = req.body.numero_piece;
    if (req.body.date_ecriture !== undefined) updates.date_ecriture = req.body.date_ecriture;
    if (req.body.libelle !== undefined) updates.libelle = req.body.libelle;
    if (req.body.reference_externe !== undefined) updates.reference_externe = req.body.reference_externe;
    if (req.body.valide !== undefined) updates.valide = req.body.valide;
    if (Object.keys(updates).length) await ecriture.update(updates);
    if (Array.isArray(req.body.lignes)) {
      const lignes = req.body.lignes;
      const totalDebit = lignes.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
      const totalCredit = lignes.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
      if (Math.abs(totalDebit - totalCredit) > 0.01) return res.status(400).json({ message: 'Débit et crédit doivent être équilibrés' });
      await LigneEcritureFin.destroy({ where: { ecriture_id: ecriture.id } });
      for (let i = 0; i < lignes.length; i++) {
        const l = lignes[i];
        await LigneEcritureFin.create({
          ecriture_id: ecriture.id,
          compte_id: l.compte_id,
          libelle_ligne: l.libelle_ligne || null,
          debit: parseFloat(l.debit) || 0,
          credit: parseFloat(l.credit) || 0,
          ordre: l.ordre != null ? l.ordre : i
        });
      }
    }
    const updated = await EcritureFin.findByPk(ecriture.id, {
      include: [
        { model: JournalFin, as: 'journal' },
        { model: User, as: 'createur', attributes: ['id', 'nom', 'prenom'] },
        { model: LigneEcritureFin, as: 'lignes', include: [{ model: CompteFin, as: 'compte' }] }
      ]
    });
    return res.json({ data: updated });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ message: 'Ce numéro de pièce existe déjà' });
    console.error('Finances ecriture update:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PATCH /api/finances/ecritures/:id/valider
router.patch('/ecritures/:id/valider', async (req, res) => {
  try {
    const ecriture = await EcritureFin.findByPk(req.params.id, {
      include: [{ model: LigneEcritureFin, as: 'lignes', include: [{ model: CompteFin, as: 'compte', attributes: ['id', 'devise'] }] }]
    });
    if (!ecriture) return res.status(404).json({ message: 'Écriture non trouvée' });
    if (ecriture.valide) return res.json({ data: ecriture, message: 'Déjà validée' });
    const devises = [...new Set((ecriture.lignes || []).map(l => (l.compte?.devise || 'FC').toString().trim().toUpperCase()))];
    if (devises.length > 1) return res.status(400).json({ message: 'Toutes les lignes doivent concerner des comptes dans la même devise (comptabilité multi-devises)' });
    const totalDebit = ecriture.lignes.reduce((s, l) => s + parseFloat(l.debit || 0), 0);
    const totalCredit = ecriture.lignes.reduce((s, l) => s + parseFloat(l.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) return res.status(400).json({ message: 'Débit et crédit doivent être équilibrés pour valider' });
    await ecriture.update({ valide: true });
    const updated = await EcritureFin.findByPk(ecriture.id, {
      include: [
        { model: JournalFin, as: 'journal' },
        { model: User, as: 'createur', attributes: ['id', 'nom', 'prenom'] },
        { model: LigneEcritureFin, as: 'lignes', include: [{ model: CompteFin, as: 'compte' }] }
      ]
    });
    return res.json({ data: updated, message: 'Écriture validée' });
  } catch (err) {
    console.error('Finances ecriture valider:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// DELETE /api/finances/ecritures/:id
router.delete('/ecritures/:id', async (req, res) => {
  try {
    const ecriture = await EcritureFin.findByPk(req.params.id);
    if (!ecriture) return res.status(404).json({ message: 'Écriture non trouvée' });
    if (ecriture.valide) return res.status(400).json({ message: 'Une écriture validée ne peut pas être supprimée' });
    await ecriture.destroy(); // CASCADE supprime les lignes
    return res.json({ message: 'Écriture supprimée' });
  } catch (err) {
    console.error('Finances ecriture delete:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// --- Trésorerie (synchronisé module Finances) ---
// GET /api/finances/tresorerie — soldes des comptes de trésorerie (classe 5)
router.get('/tresorerie', async (req, res) => {
  try {
    const comptesTresorerie = await CompteFin.findAll({
      where: { type_compte: 'tresorerie', actif: true },
      order: [['code', 'ASC']],
      attributes: ['id', 'code', 'libelle', 'type_compte', 'solde_ouverture', 'devise']
    });
    const { sequelize } = require('../config/database');
    const { QueryTypes } = require('sequelize');
    const result = [];
    const totauxParDevise = {};
    for (const c of comptesTresorerie) {
      const soldeLignes = await sequelize.query(
        `SELECT COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0) AS mouvement
         FROM tbl_fin_lignes_ecriture l
         INNER JOIN tbl_fin_ecritures e ON e.id = l.ecriture_id AND e.valide = 1
         WHERE l.compte_id = :compteId`,
        { replacements: { compteId: c.id }, type: QueryTypes.SELECT }
      );
      const mouvement = parseFloat(soldeLignes[0]?.mouvement || 0);
      const soldeCourant = parseFloat(c.solde_ouverture || 0) + mouvement;
      const devise = (c.devise || 'FC').trim().toUpperCase();
      totauxParDevise[devise] = (totauxParDevise[devise] || 0) + soldeCourant;
      result.push({
        id: c.id,
        code: c.code,
        libelle: c.libelle,
        devise: c.devise || 'FC',
        solde_ouverture: parseFloat(c.solde_ouverture || 0),
        mouvement,
        solde_courant: soldeCourant
      });
    }
    return res.json({
      data: {
        comptes_tresorerie: result,
        total_tresorerie: totauxParDevise.FC ?? 0,
        totaux_par_devise: totauxParDevise
      }
    });
  } catch (err) {
    console.error('Finances tresorerie soldes:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/finances/tresorerie/mouvements — écritures touchant les comptes trésorerie (période)
router.get('/tresorerie/mouvements', [
  query('date_debut').optional().isDate(),
  query('date_fin').optional().isDate(),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const whereEcriture = { valide: true };
    if (req.query.date_debut || req.query.date_fin) {
      whereEcriture.date_ecriture = {};
      if (req.query.date_debut) whereEcriture.date_ecriture[Op.gte] = req.query.date_debut;
      if (req.query.date_fin) whereEcriture.date_ecriture[Op.lte] = req.query.date_fin;
    }
    const compteIdsTresorerie = await CompteFin.findAll({
      where: { type_compte: 'tresorerie' },
      attributes: ['id']
    }).then(rows => rows.map(r => r.id));
    if (compteIdsTresorerie.length === 0) {
      return res.json({ data: [], pagination: { total: 0 } });
    }
    const ecritures = await EcritureFin.findAll({
      where: whereEcriture,
      include: [
        { model: JournalFin, as: 'journal', attributes: ['id', 'code', 'libelle'] },
        { model: LigneEcritureFin, as: 'lignes', where: { compte_id: { [Op.in]: compteIdsTresorerie } }, required: true, include: [{ model: CompteFin, as: 'compte', attributes: ['id', 'code', 'libelle'] }] }
      ],
      order: [['date_ecriture', 'DESC'], ['id', 'DESC']],
      limit
    });
    return res.json({ data: ecritures, pagination: { total: ecritures.length } });
  } catch (err) {
    console.error('Finances tresorerie mouvements:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// --- Budgets (synchronisé plan comptable + écritures) ---
// GET /api/finances/budgets
router.get('/budgets', [
  query('annee').optional().isInt({ min: 2000, max: 2100 })
], async (req, res) => {
  try {
    const where = {};
    if (req.query.annee) where.annee = parseInt(req.query.annee, 10);
    const budgets = await BudgetFin.findAll({
      where,
      order: [['annee', 'DESC'], ['id', 'DESC']],
      include: [{ model: User, as: 'createur', attributes: ['id', 'nom', 'prenom'] }]
    });
    return res.json({ data: budgets });
  } catch (err) {
    console.error('Finances budgets list:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/finances/budgets
router.post('/budgets', [
  body('libelle').trim().notEmpty().withMessage('Libellé requis'),
  body('annee').isInt({ min: 2000, max: 2100 }).withMessage('Année invalide'),
  body('statut').optional().isIn(['brouillon', 'valide']),
  body('devise').optional().isString().isLength({ max: 5 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    const budget = await BudgetFin.create({
      libelle: req.body.libelle,
      annee: parseInt(req.body.annee, 10),
      statut: req.body.statut || 'brouillon',
      devise: req.body.devise || 'FC',
      created_by: req.user?.id || null
    });
    return res.status(201).json({ data: budget });
  } catch (err) {
    console.error('Finances budget create:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Routes plus spécifiques AVANT /budgets/:id pour éviter que "lignes" soit pris pour un id
// PUT /api/finances/budgets/lignes/:ligneId
router.put('/budgets/lignes/:ligneId', [
  body('montant_prevu').optional().isFloat({ min: 0 }),
  body('ordre').optional().isInt({ min: 0 })
], async (req, res) => {
  try {
    const ligne = await LigneBudgetFin.findByPk(req.params.ligneId, { include: [{ model: BudgetFin, as: 'budget' }] });
    if (!ligne) return res.status(404).json({ message: 'Ligne non trouvée' });
    if (ligne.budget?.statut === 'valide') return res.status(400).json({ message: 'Impossible de modifier une ligne d\'un budget validé' });
    await ligne.update({
      ...(req.body.montant_prevu !== undefined && { montant_prevu: parseFloat(req.body.montant_prevu) }),
      ...(req.body.ordre !== undefined && { ordre: parseInt(req.body.ordre, 10) })
    });
    const withCompte = await LigneBudgetFin.findByPk(ligne.id, { include: [{ model: CompteFin, as: 'compte', attributes: ['id', 'code', 'libelle', 'type_compte'] }] });
    return res.json({ data: withCompte });
  } catch (err) {
    console.error('Finances budget ligne update:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// DELETE /api/finances/budgets/lignes/:ligneId
router.delete('/budgets/lignes/:ligneId', async (req, res) => {
  try {
    const ligne = await LigneBudgetFin.findByPk(req.params.ligneId, { include: [{ model: BudgetFin, as: 'budget' }] });
    if (!ligne) return res.status(404).json({ message: 'Ligne non trouvée' });
    if (ligne.budget?.statut === 'valide') return res.status(400).json({ message: 'Impossible de supprimer une ligne d\'un budget validé' });
    await ligne.destroy();
    return res.json({ message: 'Ligne supprimée' });
  } catch (err) {
    console.error('Finances budget ligne delete:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/finances/budgets/:id — budget + lignes avec montant réalisé (depuis écritures validées de l'année)
router.get('/budgets/:id', async (req, res) => {
  try {
    const budget = await BudgetFin.findByPk(req.params.id, {
      include: [
        { model: User, as: 'createur', attributes: ['id', 'nom', 'prenom'] },
        { model: LigneBudgetFin, as: 'lignes', include: [{ model: CompteFin, as: 'compte', attributes: ['id', 'code', 'libelle', 'type_compte'] }], order: [['ordre', 'ASC'], ['id', 'ASC']] }
      ]
    });
    if (!budget) return res.status(404).json({ message: 'Budget non trouvé' });
    const annee = budget.annee;
    const { QueryTypes } = require('sequelize');
    const lignesWithRealise = await Promise.all((budget.lignes || []).map(async (ligne) => {
      const [rows] = await sequelize.query(
        `SELECT COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0) AS mouvement
         FROM tbl_fin_lignes_ecriture l
         INNER JOIN tbl_fin_ecritures e ON e.id = l.ecriture_id AND e.valide = 1
         WHERE l.compte_id = :compteId AND YEAR(e.date_ecriture) = :annee`,
        { replacements: { compteId: ligne.compte_id, annee }, type: QueryTypes.SELECT }
      );
      const montant_realise = parseFloat(rows[0]?.mouvement || 0);
      return {
        id: ligne.id,
        budget_id: ligne.budget_id,
        compte_id: ligne.compte_id,
        montant_prevu: parseFloat(ligne.montant_prevu || 0),
        montant_realise: montant_realise,
        ecart: parseFloat(ligne.montant_prevu || 0) - montant_realise,
        ordre: ligne.ordre,
        compte: ligne.compte
      };
    }));
    return res.json({
      data: {
        ...budget.toJSON(),
        lignes: lignesWithRealise
      }
    });
  } catch (err) {
    console.error('Finances budget get:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/finances/budgets/:id
router.put('/budgets/:id', [
  body('libelle').optional().trim().notEmpty(),
  body('annee').optional().isInt({ min: 2000, max: 2100 }),
  body('statut').optional().isIn(['brouillon', 'valide']),
  body('devise').optional().isString().isLength({ max: 5 })
], async (req, res) => {
  try {
    const budget = await BudgetFin.findByPk(req.params.id);
    if (!budget) return res.status(404).json({ message: 'Budget non trouvé' });
    if (budget.statut === 'valide') return res.status(400).json({ message: 'Un budget validé ne peut pas être modifié' });
    await budget.update({
      ...(req.body.libelle !== undefined && { libelle: req.body.libelle }),
      ...(req.body.annee !== undefined && { annee: parseInt(req.body.annee, 10) }),
      ...(req.body.statut !== undefined && { statut: req.body.statut }),
      ...(req.body.devise !== undefined && { devise: req.body.devise })
    });
    return res.json({ data: budget });
  } catch (err) {
    console.error('Finances budget update:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// DELETE /api/finances/budgets/:id
router.delete('/budgets/:id', async (req, res) => {
  try {
    const budget = await BudgetFin.findByPk(req.params.id);
    if (!budget) return res.status(404).json({ message: 'Budget non trouvé' });
    await budget.destroy();
    return res.json({ message: 'Budget supprimé' });
  } catch (err) {
    console.error('Finances budget delete:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/finances/budgets/:id/lignes
router.post('/budgets/:id/lignes', [
  body('compte_id').isInt().withMessage('Compte requis'),
  body('montant_prevu').optional().isFloat({ min: 0 }),
  body('ordre').optional().isInt({ min: 0 })
], async (req, res) => {
  try {
    const budget = await BudgetFin.findByPk(req.params.id);
    if (!budget) return res.status(404).json({ message: 'Budget non trouvé' });
    if (budget.statut === 'valide') return res.status(400).json({ message: 'Impossible d\'ajouter une ligne à un budget validé' });
    const compte = await CompteFin.findByPk(req.body.compte_id);
    if (!compte) return res.status(404).json({ message: 'Compte non trouvé' });
    const [ligne, created] = await LigneBudgetFin.findOrCreate({
      where: { budget_id: budget.id, compte_id: req.body.compte_id },
      defaults: {
        montant_prevu: parseFloat(req.body.montant_prevu) || 0,
        ordre: parseInt(req.body.ordre, 10) || 0
      }
    });
    if (!created) await ligne.update({ montant_prevu: parseFloat(req.body.montant_prevu) || ligne.montant_prevu, ordre: parseInt(req.body.ordre, 10) ?? ligne.ordre });
    const withCompte = await LigneBudgetFin.findByPk(ligne.id, { include: [{ model: CompteFin, as: 'compte', attributes: ['id', 'code', 'libelle', 'type_compte'] }] });
    return res.status(201).json({ data: withCompte });
  } catch (err) {
    console.error('Finances budget ligne create:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// --- Facturation (synchronisé plan comptable, écritures) ---
const FACTURE_PREFIX = 'FAC';
function nextNumeroFacture() {
  const y = new Date().getFullYear();
  return `${FACTURE_PREFIX}-${y}-`;
}

// GET /api/finances/factures/next-numero
router.get('/factures/next-numero', async (req, res) => {
  try {
    const prefix = nextNumeroFacture();
    const count = await FactureFin.count({ where: { numero: { [Op.like]: `${prefix}%` } } });
    const numero = `${prefix}${String(count + 1).padStart(4, '0')}`;
    return res.json({ numero });
  } catch (err) {
    console.error('Finances factures next-numero:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/finances/factures
router.get('/factures', [
  query('statut').optional().isIn(['brouillon', 'envoyee', 'payee', 'annulee']),
  query('date_debut').optional().isDate(),
  query('date_fin').optional().isDate(),
  query('search').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    const where = {};
    if (req.query.statut) where.statut = req.query.statut;
    if (req.query.date_debut || req.query.date_fin) {
      where.date_facture = {};
      if (req.query.date_debut) where.date_facture[Op.gte] = req.query.date_debut;
      if (req.query.date_fin) where.date_facture[Op.lte] = req.query.date_fin;
    }
    if (req.query.search) {
      where[Op.or] = [
        { numero: { [Op.like]: `%${req.query.search}%` } },
        { client_nom: { [Op.like]: `%${req.query.search}%` } }
      ];
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const { count, rows } = await FactureFin.findAndCountAll({
      where,
      attributes: { exclude: ['client_id'] },
      include: [{ model: User, as: 'createur', attributes: ['id', 'nom', 'prenom'] }],
      order: [['date_facture', 'DESC'], ['id', 'DESC']],
      limit,
      offset
    });
    return res.json({ data: rows, pagination: { page, limit, total: count, pages: Math.ceil(count / limit) } });
  } catch (err) {
    console.error('Finances factures list:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Routes factures plus spécifiques avant /factures/:id
// POST /api/finances/factures/:id/lignes
router.post('/factures/:id/lignes', [
  body('libelle').trim().notEmpty().withMessage('Libellé requis'),
  body('quantite').optional().isFloat({ min: 0 }),
  body('prix_unitaire').optional().isFloat({ min: 0 }),
  body('taux_tva').optional().isFloat({ min: 0, max: 100 }),
  body('compte_id').optional().isInt(),
  body('ordre').optional().isInt({ min: 0 })
], async (req, res) => {
  try {
    const facture = await FactureFin.findByPk(req.params.id, { attributes: { exclude: ['client_id'] } });
    if (!facture) return res.status(404).json({ message: 'Facture non trouvée' });
    if (facture.statut !== 'brouillon') return res.status(400).json({ message: 'Seules les factures en brouillon peuvent être modifiées' });
    const qte = parseFloat(req.body.quantite) || 1;
    const pu = parseFloat(req.body.prix_unitaire) || 0;
    const tauxTva = parseFloat(req.body.taux_tva) || 0;
    const montantHT = qte * pu;
    const montantTVA = montantHT * (tauxTva / 100);
    const montantTTC = montantHT + montantTVA;
    const ordre = parseInt(req.body.ordre, 10) || 0;
    const ligne = await LigneFactureFin.create({
      facture_id: facture.id,
      compte_id: req.body.compte_id || null,
      libelle: req.body.libelle,
      quantite: qte,
      prix_unitaire: pu,
      montant_ht: montantHT,
      taux_tva: tauxTva,
      montant_ttc: montantTTC,
      ordre
    });
    await recalcFactureTotals(facture.id);
    const withCompte = await LigneFactureFin.findByPk(ligne.id, { include: [{ model: CompteFin, as: 'compte', attributes: ['id', 'code', 'libelle'] }] });
    return res.status(201).json({ data: withCompte });
  } catch (err) {
    console.error('Finances facture ligne create:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/finances/factures/lignes/:ligneId
router.put('/factures/lignes/:ligneId', [
  body('libelle').optional().trim().notEmpty(),
  body('quantite').optional().isFloat({ min: 0 }),
  body('prix_unitaire').optional().isFloat({ min: 0 }),
  body('taux_tva').optional().isFloat({ min: 0, max: 100 }),
  body('compte_id').optional().isInt(),
  body('ordre').optional().isInt({ min: 0 })
], async (req, res) => {
  try {
    const ligne = await LigneFactureFin.findByPk(req.params.ligneId, { include: [{ model: FactureFin, as: 'facture' }] });
    if (!ligne) return res.status(404).json({ message: 'Ligne non trouvée' });
    if (ligne.facture?.statut !== 'brouillon') return res.status(400).json({ message: 'Facture non modifiable' });
    const updates = {};
    if (req.body.libelle !== undefined) updates.libelle = req.body.libelle;
    if (req.body.quantite !== undefined) updates.quantite = parseFloat(req.body.quantite);
    if (req.body.prix_unitaire !== undefined) updates.prix_unitaire = parseFloat(req.body.prix_unitaire);
    if (req.body.taux_tva !== undefined) updates.taux_tva = parseFloat(req.body.taux_tva);
    if (req.body.compte_id !== undefined) updates.compte_id = req.body.compte_id || null;
    if (req.body.ordre !== undefined) updates.ordre = parseInt(req.body.ordre, 10);
    if (Object.keys(updates).length) {
      const qte = updates.quantite !== undefined ? updates.quantite : parseFloat(ligne.quantite);
      const pu = updates.prix_unitaire !== undefined ? updates.prix_unitaire : parseFloat(ligne.prix_unitaire);
      const tauxTva = updates.taux_tva !== undefined ? updates.taux_tva : parseFloat(ligne.taux_tva);
      updates.montant_ht = qte * pu;
      updates.montant_ttc = updates.montant_ht + (updates.montant_ht * (tauxTva / 100));
      await ligne.update(updates);
    }
    await recalcFactureTotals(ligne.facture_id);
    const withCompte = await LigneFactureFin.findByPk(ligne.id, { include: [{ model: CompteFin, as: 'compte', attributes: ['id', 'code', 'libelle'] }] });
    return res.json({ data: withCompte });
  } catch (err) {
    console.error('Finances facture ligne update:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// DELETE /api/finances/factures/lignes/:ligneId
router.delete('/factures/lignes/:ligneId', async (req, res) => {
  try {
    const ligne = await LigneFactureFin.findByPk(req.params.ligneId, { include: [{ model: FactureFin, as: 'facture' }] });
    if (!ligne) return res.status(404).json({ message: 'Ligne non trouvée' });
    if (ligne.facture?.statut !== 'brouillon') return res.status(400).json({ message: 'Facture non modifiable' });
    const factureId = ligne.facture_id;
    await ligne.destroy();
    await recalcFactureTotals(factureId);
    return res.json({ message: 'Ligne supprimée' });
  } catch (err) {
    console.error('Finances facture ligne delete:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

async function recalcFactureTotals(factureId) {
  const lignes = await LigneFactureFin.findAll({ where: { facture_id: factureId } });
  let totalHT = 0, totalTVA = 0, totalTTC = 0;
  lignes.forEach((l) => {
    totalHT += parseFloat(l.montant_ht || 0);
    totalTVA += parseFloat(l.montant_ttc || 0) - parseFloat(l.montant_ht || 0);
    totalTTC += parseFloat(l.montant_ttc || 0);
  });
  await FactureFin.update(
    { total_ht: totalHT, total_tva: totalTVA, total_ttc: totalTTC },
    { where: { id: factureId } }
  );
}

// POST /api/finances/factures/:id/lier-caisse — lier une facture payée à une caisse (crée un encaissement)
router.post('/factures/:id/lier-caisse', [
  body('caisse_id').isInt({ min: 1 }).withMessage('La caisse est requise')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: 'Caisse requise', errors: errors.array() });
    const factureId = parseInt(req.params.id, 10);
    const caisseId = parseInt(req.body.caisse_id, 10);
    const facture = await FactureFin.findByPk(factureId, { attributes: { exclude: ['client_id'] } });
    if (!facture) return res.status(404).json({ message: 'Facture non trouvée' });
    if (facture.statut !== 'payee') return res.status(400).json({ message: 'Seules les factures payées peuvent être liées à une caisse' });
    if (facture.caisse_id) return res.status(400).json({ message: 'Cette facture est déjà liée à une caisse' });

    const reference = `ENC-${facture.numero}`;
    const rows = await sequelize.query(
      'SELECT id FROM tbl_encaissements WHERE reference = ?',
      { replacements: [reference], type: sequelize.QueryTypes.SELECT }
    );
    const existing = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (existing) return res.status(400).json({ message: 'Un encaissement existe déjà pour cette facture' });

    const datePaiement = new Date();
    const insertRaw = await sequelize.query(
      `INSERT INTO tbl_encaissements (
        reference, montant, devise, type_paiement, statut, date_paiement,
        description, beneficiaire, user_guichet_id, created_by,
        encaissement_caisse_id, numero_transaction
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      {
        replacements: [
          reference,
          facture.total_ttc,
          facture.devise || 'FC',
          'Virement',
          'Validé',
          datePaiement,
          `Encaissement facture ${facture.numero}`,
          facture.client_nom || 'Client',
          null,
          req.user?.id || null,
          caisseId,
          null
        ],
        type: sequelize.QueryTypes.INSERT
      }
    );
    const okPacket = Array.isArray(insertRaw) ? insertRaw[0] : insertRaw;
    const encaissementId = (okPacket && (typeof okPacket.insertId !== 'undefined' ? okPacket.insertId : okPacket)) || null;
    if (encaissementId == null || encaissementId === '') {
      console.error('Finances lier-caisse: insertId manquant après INSERT', { insertRaw, okPacket });
      return res.status(500).json({ message: 'Erreur lors de la création de l\'encaissement (insertId manquant)' });
    }

    await FactureFin.update(
      { caisse_id: caisseId, encaissement_id: encaissementId },
      { where: { id: factureId } }
    );

    const updated = await FactureFin.findByPk(factureId, {
      attributes: { exclude: ['client_id'] },
      include: [
        { model: User, as: 'createur', attributes: ['id', 'nom', 'prenom'] },
        { model: LigneFactureFin, as: 'lignes', order: [['ordre', 'ASC'], ['id', 'ASC']], include: [{ model: CompteFin, as: 'compte', attributes: ['id', 'code', 'libelle'] }] },
        { model: EcritureFin, as: 'ecriture', attributes: ['id', 'numero_piece', 'date_ecriture', 'valide'] }
      ]
    });
    let caisse = null;
    let encaissement = null;
    if (updated.caisse_id) {
      const [caisseRows] = await sequelize.query('SELECT id, nom, code_caisse, devise FROM tbl_caisses WHERE id = ?', { replacements: [updated.caisse_id], type: sequelize.QueryTypes.SELECT });
      caisse = caisseRows?.[0] || null;
    }
    if (updated.encaissement_id) {
      const [encRows] = await sequelize.query('SELECT id, reference, montant, date_paiement, statut FROM tbl_encaissements WHERE id = ?', { replacements: [updated.encaissement_id], type: sequelize.QueryTypes.SELECT });
      encaissement = encRows?.[0] || null;
    }
    const data = updated.toJSON ? updated.toJSON() : updated;
    data.caisse = caisse;
    data.encaissement = encaissement;
    return res.json({ data, message: 'Facture liée à la caisse. Encaissement créé.' });
  } catch (err) {
    console.error('Finances facture lier-caisse:', err);
    return res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// GET /api/finances/factures/:id
router.get('/factures/:id', async (req, res) => {
  try {
    const facture = await FactureFin.findByPk(req.params.id, {
      include: [
        { model: User, as: 'createur', attributes: ['id', 'nom', 'prenom'] },
        { model: Client, as: 'client', attributes: ['id', 'assujetti'], required: false },
        { model: LigneFactureFin, as: 'lignes', order: [['ordre', 'ASC'], ['id', 'ASC']], include: [{ model: CompteFin, as: 'compte', attributes: ['id', 'code', 'libelle'] }] },
        { model: EcritureFin, as: 'ecriture', attributes: ['id', 'numero_piece', 'date_ecriture', 'valide'] }
      ]
    });
    if (!facture) return res.status(404).json({ message: 'Facture non trouvée' });
    const data = facture.toJSON ? facture.toJSON() : facture;
    data.client_assujetti = data.client ? !!data.client.assujetti : false;
    delete data.client;
    if (data.caisse_id) {
      const [caisseRows] = await sequelize.query('SELECT id, nom, code_caisse, devise FROM tbl_caisses WHERE id = ?', { replacements: [data.caisse_id], type: sequelize.QueryTypes.SELECT });
      data.caisse = caisseRows?.[0] || null;
    }
    if (data.encaissement_id) {
      const [encRows] = await sequelize.query('SELECT id, reference, montant, date_paiement, statut FROM tbl_encaissements WHERE id = ?', { replacements: [data.encaissement_id], type: sequelize.QueryTypes.SELECT });
      data.encaissement = encRows?.[0] || null;
    }
    return res.json({ data });
  } catch (err) {
    console.error('Finances facture get:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// POST /api/finances/factures — client_id optionnel : remplit client_nom, client_email, client_adresse, client_telephone depuis le référentiel
router.post('/factures', [
  body('numero').trim().notEmpty().withMessage('Numéro requis'),
  body('client_id').optional().isInt(),
  body('client_nom').optional().trim(),
  body('date_facture').isDate().withMessage('Date requise'),
  body('client_email').optional().isEmail(),
  body('client_adresse').optional().trim(),
  body('client_telephone').optional().trim(),
  body('date_echeance').optional().isDate(),
  body('statut').optional().isIn(['brouillon', 'envoyee', 'payee', 'annulee']),
  body('devise').optional().isString().isLength({ max: 5 }),
  body('template_code').optional().isIn(['minimal', 'modern', 'classic']),
  body('remarques').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    let client_nom = req.body.client_nom || null;
    let client_email = req.body.client_email || null;
    let client_adresse = req.body.client_adresse || null;
    let client_telephone = req.body.client_telephone || null;
    let client_id = req.body.client_id ? parseInt(req.body.client_id, 10) : null;
    if (client_id) {
      const client = await Client.findByPk(client_id);
      if (client) {
        client_nom = client.getDisplayName();
        client_email = client.email || client_email;
        client_adresse = client.adresse || client_adresse;
        client_telephone = client.telephone || client.mobile || client_telephone;
      }
    }
    if (!client_nom || !client_nom.trim()) return res.status(400).json({ message: 'Client requis (client_id ou client_nom)' });
    const facture = await FactureFin.create({
      numero: req.body.numero,
      client_id: client_id || null,
      client_nom: client_nom.trim(),
      client_email: client_email || null,
      client_adresse: client_adresse || null,
      client_telephone: client_telephone || null,
      date_facture: req.body.date_facture,
      date_echeance: req.body.date_echeance || null,
      statut: req.body.statut || 'brouillon',
      total_ht: 0,
      total_tva: 0,
      total_ttc: 0,
      devise: req.body.devise || 'FC',
      template_code: req.body.template_code || 'modern',
      remarques: req.body.remarques || null,
      created_by: req.user?.id || null
    });
    const created = await FactureFin.findByPk(facture.id, { attributes: { exclude: ['client_id'] }, include: [{ model: User, as: 'createur', attributes: ['id', 'nom', 'prenom'] }] });
    return res.status(201).json({ data: created });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ message: 'Ce numéro de facture existe déjà' });
    console.error('Finances facture create:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PUT /api/finances/factures/:id
router.put('/factures/:id', [
  body('numero').optional().trim().notEmpty(),
  body('client_id').optional().isInt(),
  body('client_nom').optional().trim(),
  body('date_facture').optional().isDate(),
  body('client_email').optional().isEmail(),
  body('client_adresse').optional().trim(),
  body('client_telephone').optional().trim(),
  body('date_echeance').optional().isDate(),
  body('statut').optional().isIn(['brouillon', 'envoyee', 'payee', 'annulee']),
  body('devise').optional().isString().isLength({ max: 5 }),
  body('template_code').optional().isIn(['minimal', 'modern', 'classic']),
  body('remarques').optional().trim()
], async (req, res) => {
  try {
    const facture = await FactureFin.findByPk(req.params.id, { attributes: { exclude: ['client_id'] } });
    if (!facture) return res.status(404).json({ message: 'Facture non trouvée' });
    if (facture.statut !== 'brouillon') return res.status(400).json({ message: 'Seules les factures en brouillon peuvent être modifiées' });
    const updates = {};
    let client_id = req.body.client_id !== undefined ? (req.body.client_id ? parseInt(req.body.client_id, 10) : null) : undefined;
    if (client_id !== undefined) updates.client_id = client_id;
    if (req.body.client_id && client_id) {
      const client = await Client.findByPk(client_id);
      if (client) {
        updates.client_nom = client.getDisplayName();
        updates.client_email = client.email || facture.client_email;
        updates.client_adresse = client.adresse || facture.client_adresse;
        updates.client_telephone = client.telephone || client.mobile || facture.client_telephone;
      }
    }
    ['numero', 'client_nom', 'client_email', 'client_adresse', 'client_telephone', 'date_facture', 'date_echeance', 'statut', 'devise', 'template_code', 'remarques'].forEach((f) => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });
    if (Object.keys(updates).length) await facture.update(updates);
    const updated = await FactureFin.findByPk(facture.id, { attributes: { exclude: ['client_id'] }, include: [{ model: User, as: 'createur', attributes: ['id', 'nom', 'prenom'] }] });
    return res.json({ data: updated });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ message: 'Ce numéro de facture existe déjà' });
    console.error('Finances facture update:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// PATCH /api/finances/factures/:id/statut
router.patch('/factures/:id/statut', [
  body('statut').isIn(['brouillon', 'envoyee', 'payee', 'annulee']).withMessage('Statut invalide')
], async (req, res) => {
  try {
    const facture = await FactureFin.findByPk(req.params.id, { include: [{ model: LigneFactureFin, as: 'lignes' }] });
    if (!facture) return res.status(404).json({ message: 'Facture non trouvée' });
    const newStatut = req.body.statut;
    await facture.update({ statut: newStatut });
    let ecritureCreated = false;
    let ecritureMessage = null;
    if (newStatut === 'payee' && !facture.ecriture_id) {
      let journalVentes = await JournalFin.findOne({ where: { [Op.or]: [{ code: 'VT' }, { code: 'VE' }], actif: true } });
      if (!journalVentes) journalVentes = await JournalFin.findOne({ where: { type_journal: 'ventes', actif: true } });
      if (!journalVentes) {
        ecritureMessage = 'Aucun journal Ventes (code VT ou VE) actif. Créez un journal Ventes dans le plan comptable.';
      } else {
        const deviseFacture = (facture.devise || 'FC').trim().toUpperCase();
        // Les écritures sont toujours en FC : factures en USD converties au taux 1 USD = TAUX_USD_FC FC
        const totalTtc = parseFloat(facture.total_ttc || 0);
        const montantFC = deviseFacture === 'FC' ? totalTtc : totalTtc * TAUX_USD_FC;
        // Toujours utiliser des comptes FC pour l'écriture (journal en francs congolais)
        let compteProduit = await CompteFin.findOne({ where: { type_compte: 'produit', actif: true, devise: 'FC' } });
        let compteTresorerie = await CompteFin.findOne({ where: { type_compte: 'tresorerie', actif: true, devise: 'FC' } });
        if (!compteProduit) compteProduit = await CompteFin.findOne({ where: { type_compte: 'produit', actif: true } });
        if (!compteTresorerie) compteTresorerie = await CompteFin.findOne({ where: { type_compte: 'tresorerie', actif: true } });
        if (!compteProduit || !compteTresorerie) {
          ecritureMessage = 'Compte produit ou trésorerie manquant. Créez des comptes "produit" et "trésorerie" (en FC) dans le plan comptable.';
        } else {
          const ecriture = await EcritureFin.create({
            journal_id: journalVentes.id,
            numero_piece: facture.numero,
            date_ecriture: facture.date_facture,
            libelle: `Facture client ${facture.client_nom}${deviseFacture !== 'FC' ? ` (${totalTtc} ${deviseFacture} = ${montantFC.toFixed(0)} FC)` : ''}`,
            reference_externe: facture.numero,
            valide: true,
            created_by: req.user?.id || null
          });
          await LigneEcritureFin.create({ ecriture_id: ecriture.id, compte_id: compteProduit.id, libelle_ligne: facture.numero, debit: 0, credit: montantFC, ordre: 0 });
          await LigneEcritureFin.create({ ecriture_id: ecriture.id, compte_id: compteTresorerie.id, libelle_ligne: facture.numero, debit: montantFC, credit: 0, ordre: 1 });
          await facture.update({ ecriture_id: ecriture.id });
          ecritureCreated = true;
        }
      }
    }
    const updated = await FactureFin.findByPk(facture.id, {
      include: [
        { model: User, as: 'createur', attributes: ['id', 'nom', 'prenom'] },
        { model: LigneFactureFin, as: 'lignes' },
        { model: EcritureFin, as: 'ecriture', attributes: ['id', 'numero_piece', 'valide'] }
      ]
    });
    const response = { data: updated, message: ecritureCreated ? 'Statut mis à jour et écriture comptable créée' : 'Statut mis à jour' };
    if (ecritureCreated) response.ecriture_created = true;
    if (ecritureMessage) { response.ecriture_created = false; response.ecriture_message = ecritureMessage; }
    return res.json(response);
  } catch (err) {
    console.error('Finances facture statut:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/finances/factures/:id/pdf
router.get('/factures/:id/pdf', async (req, res) => {
  try {
    const facture = await FactureFin.findByPk(req.params.id, { attributes: { exclude: ['client_id'] }, include: [{ model: LigneFactureFin, as: 'lignes', order: [['ordre', 'ASC'], ['id', 'ASC']] }] });
    if (!facture) return res.status(404).json({ message: 'Facture non trouvée' });
    const { buffer } = await pdfService.generateFacturePDF(facture, facture.lignes || []);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Facture-${facture.numero}.pdf"`);
    return res.send(buffer);
  } catch (err) {
    console.error('Finances facture pdf:', err);
    return res.status(500).json({ message: 'Erreur génération PDF' });
  }
});

// POST /api/finances/factures/:id/envoyer-email
router.post('/factures/:id/envoyer-email', [
  body('email').optional().isEmail()
], async (req, res) => {
  try {
    const facture = await FactureFin.findByPk(req.params.id, { attributes: { exclude: ['client_id'] }, include: [{ model: LigneFactureFin, as: 'lignes', order: [['ordre', 'ASC'], ['id', 'ASC']] }] });
    if (!facture) return res.status(404).json({ message: 'Facture non trouvée' });
    const toEmail = req.body.email || facture.client_email;
    if (!toEmail) return res.status(400).json({ message: 'Aucun email destinataire (client ou corps de la requête)' });
    let nodemailer;
    try {
      nodemailer = require('nodemailer');
    } catch (e) {
      return res.status(503).json({ message: 'Envoi d\'email non configuré (nodemailer manquant)' });
    }
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER && process.env.SMTP_PASS ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
    const { buffer } = await pdfService.generateFacturePDF(facture, facture.lignes || []);
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@hotel-beatrice.com',
      to: toEmail,
      subject: `Facture ${facture.numero} - ${process.env.APP_NAME || 'SYNAPTA SYS'}`,
      text: `Bonjour,\n\nVeuillez trouver ci-joint la facture ${facture.numero}.\n\nCordialement.`,
      attachments: [{ filename: `Facture-${facture.numero}.pdf`, content: buffer }]
    });
    await facture.update({ statut: 'envoyee' });
    return res.json({ message: 'Facture envoyée par email', statut: 'envoyee' });
  } catch (err) {
    console.error('Finances facture email:', err);
    return res.status(500).json({ message: err.message || 'Erreur envoi email' });
  }
});

// DELETE /api/finances/factures/:id
router.delete('/factures/:id', async (req, res) => {
  try {
    const facture = await FactureFin.findByPk(req.params.id, { attributes: { exclude: ['client_id'] } });
    if (!facture) return res.status(404).json({ message: 'Facture non trouvée' });
    if (facture.statut !== 'brouillon') return res.status(400).json({ message: 'Seules les factures en brouillon peuvent être supprimées' });
    await facture.destroy();
    return res.json({ message: 'Facture supprimée' });
  } catch (err) {
    console.error('Finances facture delete:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// --- Stats dashboard ---
// GET /api/finances/stats
router.get('/stats', async (req, res) => {
  try {
    const [nbComptes, nbJournaux, nbEcritures, nbEcrituresValidees, nbBudgets, nbFactures] = await Promise.all([
      CompteFin.count({ where: { actif: true } }),
      JournalFin.count({ where: { actif: true } }),
      EcritureFin.count(),
      EcritureFin.count({ where: { valide: true } }),
      BudgetFin.count(),
      FactureFin.count()
    ]);
    return res.json({
      stats: {
        nb_comptes: nbComptes,
        nb_journaux: nbJournaux,
        nb_ecritures: nbEcritures,
        nb_ecritures_validees: nbEcrituresValidees,
        nb_brouillons: nbEcritures - nbEcrituresValidees,
        nb_budgets: nbBudgets,
        nb_factures: nbFactures
      }
    });
  } catch (err) {
    console.error('Finances stats:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// --- États financiers (référentiel OHADA) ---
// Helper: soldes par compte à une date (écritures validées, date_ecriture <= date_fin)
async function getSoldesAtDate(dateFin) {
  const { QueryTypes } = require('sequelize');
  const date = dateFin || new Date().toISOString().slice(0, 10);
  const rows = await sequelize.query(
    `SELECT c.id, c.code, c.libelle, c.type_compte, c.devise,
       COALESCE(c.solde_ouverture, 0) AS solde_ouverture,
       COALESCE(SUM(
         CASE WHEN e.id IS NOT NULL THEN
           CASE WHEN c.type_compte IN ('actif','charge','tresorerie')
             THEN (l.debit - l.credit) ELSE (l.credit - l.debit) END
         ELSE 0 END
       ), 0) AS mouvement
     FROM tbl_fin_comptes c
     LEFT JOIN tbl_fin_lignes_ecriture l ON l.compte_id = c.id
     LEFT JOIN tbl_fin_ecritures e ON e.id = l.ecriture_id AND e.valide = 1 AND e.date_ecriture <= :dateFin
     WHERE c.actif = 1
     GROUP BY c.id, c.code, c.libelle, c.type_compte, c.devise, c.solde_ouverture
     ORDER BY c.code`,
    { replacements: { dateFin: date }, type: QueryTypes.SELECT }
  );
  return (rows || []).map((r) => ({
    ...r,
    solde_ouverture: parseFloat(r.solde_ouverture) || 0,
    mouvement: parseFloat(r.mouvement) || 0,
    solde: Math.round(((parseFloat(r.solde_ouverture) || 0) + (parseFloat(r.mouvement) || 0)) * 100) / 100
  }));
}

// Mouvements par compte sur une période (pour compte de résultat)
async function getMouvementsPeriod(dateDebut, dateFin) {
  const { QueryTypes } = require('sequelize');
  const d1 = dateDebut || '1900-01-01';
  const d2 = dateFin || new Date().toISOString().slice(0, 10);
  const rows = await sequelize.query(
    `SELECT c.id, c.code, c.libelle, c.type_compte, c.devise,
       COALESCE(SUM(
         CASE WHEN c.type_compte IN ('actif','charge','tresorerie')
           THEN (l.debit - l.credit) ELSE (l.credit - l.debit) END
       ), 0) AS mouvement
     FROM tbl_fin_comptes c
     INNER JOIN tbl_fin_lignes_ecriture l ON l.compte_id = c.id
     INNER JOIN tbl_fin_ecritures e ON e.id = l.ecriture_id AND e.valide = 1
       AND e.date_ecriture >= :dateDebut AND e.date_ecriture <= :dateFin
     WHERE c.actif = 1
     GROUP BY c.id, c.code, c.libelle, c.type_compte, c.devise
     ORDER BY c.code`,
    { replacements: { dateDebut: d1, dateFin: d2 }, type: QueryTypes.SELECT }
  );
  return (rows || []).map((r) => ({
    ...r,
    mouvement: parseFloat(r.mouvement) || 0
  }));
}

// GET /api/finances/etats/bilan — Bilan (actif / passif) à une date, référentiel OHADA
router.get('/etats/bilan', [
  query('date_fin').optional().isDate()
], async (req, res) => {
  try {
    const dateFin = req.query.date_fin || new Date().toISOString().slice(0, 10);
    const soldes = await getSoldesAtDate(dateFin);
    const actif = soldes.filter((s) => s.type_compte === 'actif' || s.type_compte === 'tresorerie').filter((s) => s.solde !== 0);
    const passif = soldes.filter((s) => s.type_compte === 'passif').filter((s) => s.solde !== 0);
    const totalActif = actif.reduce((sum, s) => sum + s.solde, 0);
    const totalPassif = passif.reduce((sum, s) => sum + s.solde, 0);
    return res.json({
      data: {
        date_fin: dateFin,
        actif: { lignes: actif, total: Math.round(totalActif * 100) / 100 },
        passif: { lignes: passif, total: Math.round(totalPassif * 100) / 100 },
        equilibre: Math.abs(totalActif - totalPassif) < 0.02
      }
    });
  } catch (err) {
    console.error('Finances etats bilan:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/finances/etats/compte-resultat — Compte de résultat (charges / produits) sur une période
router.get('/etats/compte-resultat', [
  query('date_debut').optional().isDate(),
  query('date_fin').optional().isDate()
], async (req, res) => {
  try {
    const dateDebut = req.query.date_debut || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
    const dateFin = req.query.date_fin || new Date().toISOString().slice(0, 10);
    const mouvements = await getMouvementsPeriod(dateDebut, dateFin);
    const charges = mouvements.filter((m) => m.type_compte === 'charge').filter((m) => m.mouvement !== 0);
    const produits = mouvements.filter((m) => m.type_compte === 'produit').filter((m) => m.mouvement !== 0);
    const totalCharges = charges.reduce((sum, m) => sum + m.mouvement, 0);
    const totalProduits = produits.reduce((sum, m) => sum + m.mouvement, 0);
    const resultat = totalProduits - totalCharges;
    return res.json({
      data: {
        date_debut: dateDebut,
        date_fin: dateFin,
        charges: { lignes: charges, total: Math.round(totalCharges * 100) / 100 },
        produits: { lignes: produits, total: Math.round(totalProduits * 100) / 100 },
        resultat_net: Math.round(resultat * 100) / 100
      }
    });
  } catch (err) {
    console.error('Finances etats compte-resultat:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/finances/etats/flux-tresorerie — Tableau des flux de trésorerie (période)
router.get('/etats/flux-tresorerie', [
  query('date_debut').optional().isDate(),
  query('date_fin').optional().isDate()
], async (req, res) => {
  try {
    const dateDebut = req.query.date_debut || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
    const dateFin = req.query.date_fin || new Date().toISOString().slice(0, 10);
    const mouvements = await getMouvementsPeriod(dateDebut, dateFin);
    const treso = mouvements.filter((m) => m.type_compte === 'tresorerie');
    const entrées = treso.filter((m) => m.mouvement > 0).reduce((s, m) => s + m.mouvement, 0);
    const sorties = treso.filter((m) => m.mouvement < 0).reduce((s, m) => s + Math.abs(m.mouvement), 0);
    const variation = entrées - sorties;
    return res.json({
      data: {
        date_debut: dateDebut,
        date_fin: dateFin,
        flux_exploitation: { libelle: 'Activité d\'exploitation', lignes: treso, entrées: Math.round(entrées * 100) / 100, sorties: Math.round(sorties * 100) / 100, net: Math.round(variation * 100) / 100 },
        flux_investissement: { libelle: 'Activité d\'investissement', lignes: [], entrées: 0, sorties: 0, net: 0 },
        flux_financement: { libelle: 'Activité de financement', lignes: [], entrées: 0, sorties: 0, net: 0 },
        variation_tresorerie: Math.round(variation * 100) / 100
      }
    });
  } catch (err) {
    console.error('Finances etats flux-tresorerie:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

// GET /api/finances/etats/annexes — Annexes (détail par poste OHADA, soldes à date)
router.get('/etats/annexes', [
  query('date_fin').optional().isDate()
], async (req, res) => {
  try {
    const dateFin = req.query.date_fin || new Date().toISOString().slice(0, 10);
    const soldes = await getSoldesAtDate(dateFin);
    const byClass = {};
    soldes.forEach((s) => {
      const cl = (s.code || '').toString().charAt(0);
      if (!byClass[cl]) byClass[cl] = { classe: cl, libelle_classe: getLibelleClasseOHADA(cl), comptes: [], total: 0 };
      byClass[cl].comptes.push(s);
      byClass[cl].total += s.solde;
    });
    const classes = ['1', '2', '3', '4', '5', '6', '7', '8'].map((cl) => ({
      ...byClass[cl],
      total: byClass[cl] ? Math.round(byClass[cl].total * 100) / 100 : 0
    })).filter((c) => c.comptes && c.comptes.length);
    return res.json({
      data: {
        date_fin: dateFin,
        referentiel: 'OHADA (SYSCOHADA)',
        classes
      }
    });
  } catch (err) {
    console.error('Finances etats annexes:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

function getLibelleClasseOHADA(cl) {
  const lib = { 1: 'Ressources durables', 2: 'Actif immobilisé', 3: 'Stocks', 4: 'Tiers', 5: 'Trésorerie', 6: 'Charges', 7: 'Produits', 8: 'Résultat' };
  return lib[cl] || `Classe ${cl}`;
}

module.exports = router;

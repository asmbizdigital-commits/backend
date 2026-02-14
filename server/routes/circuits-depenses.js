const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const { CircuitDepense, User } = require('../models');

router.use(authenticateToken);

// GET /api/circuits-depenses - Liste tous les circuits (étapes groupées par circuit_ref)
router.get('/', requireRole(['Patron', 'Administrateur', 'Superviseur Finance', 'Auditeur']), async (req, res) => {
  try {
    const rows = await CircuitDepense.findAll({
      include: [
        { model: User, as: 'createur', attributes: ['id', 'nom', 'prenom'], required: false }
      ],
      order: [['circuit_ref', 'ASC'], ['etape', 'ASC']]
    });

    // Grouper par circuit_ref
    const byRef = {};
    for (const r of rows) {
      const ref = r.circuit_ref;
      if (!byRef[ref]) byRef[ref] = { circuit_ref: ref, etapes: [] };
      byRef[ref].etapes.push({
        id: r.id,
        etape: r.etape,
        libelle_etape: r.libelle_etape,
        date_etape: r.date_etape,
        created_by: r.created_by,
        createur: r.createur ? { id: r.createur.id, nom: r.createur.nom, prenom: r.createur.prenom } : null,
        soumission_besoins_id: r.soumission_besoins_id,
        demande_fonds_id: r.demande_fonds_id,
        depense_id: r.depense_id,
        commentaire: r.commentaire
      });
    }

    const circuits = Object.values(byRef).sort((a, b) => {
      const lastA = a.etapes[a.etapes.length - 1]?.date_etape || 0;
      const lastB = b.etapes[b.etapes.length - 1]?.date_etape || 0;
      return new Date(lastB) - new Date(lastA);
    });

    res.json({ success: true, data: circuits });
  } catch (error) {
    console.error('GET circuits-depenses:', error);
    res.status(500).json({ success: false, message: 'Erreur lors du chargement des circuits' });
  }
});

module.exports = router;

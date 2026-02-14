const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const { CircuitDepense, User, SoumissionBesoins, DemandeFonds, Depense } = require('../models');

const ETAPES = {
  1: 'Soumission besoin (fonds)',
  2: 'Demande de fonds créée',
  3: 'Décaissement en attente',
  4: 'Décaissement approuvé par auditeur',
  5: 'Paiement programmé',
  6: 'Paiement effectué'
};

router.use(authenticateToken);

// GET /api/circuits-depenses - Liste tous les circuits (étapes groupées par circuit_ref)
router.get('/', requireRole(['Patron', 'Administrateur', 'Superviseur Finance', 'Auditeur']), async (req, res) => {
  try {
    const rows = await CircuitDepense.findAll({
      order: [['circuit_ref', 'ASC'], ['etape', 'ASC']]
    });

    // Grouper par circuit_ref
    const byRef = {};
    const userIds = [...new Set(rows.map((r) => r.created_by).filter(Boolean))];
    const users = userIds.length
      ? await User.findAll({ where: { id: userIds }, attributes: ['id', 'nom', 'prenom'] })
      : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, { id: u.id, nom: u.nom, prenom: u.prenom }]));

    for (const r of rows) {
      const ref = r.circuit_ref;
      if (!byRef[ref]) byRef[ref] = { circuit_ref: ref, etapes: [] };
      byRef[ref].etapes.push({
        id: r.id,
        etape: r.etape,
        libelle_etape: r.libelle_etape,
        date_etape: r.date_etape,
        created_by: r.created_by,
        createur: r.created_by ? userMap[r.created_by] || null : null,
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
    // Si la table n'existe pas (migration non exécutée en prod), retourner une liste vide
    const msg = error.message || '';
    if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('tbl_circuits_depenses')) {
      return res.json({ success: true, data: [] });
    }
    res.status(500).json({ success: false, message: 'Erreur lors du chargement des circuits' });
  }
});

// POST /api/circuits-depenses/backfill - Remplir les circuits à partir des soumissions/demandes/dépenses existantes
router.post('/backfill', requireRole(['Patron', 'Administrateur']), async (req, res) => {
  try {
    let created = 0;

    // 1. Étape 1 : soumissions type fonds
    const soumissions = await SoumissionBesoins.findAll({
      where: { type: 'fonds' },
      order: [['id', 'ASC']]
    });
    for (const s of soumissions) {
      const circuitRef = 'SB-' + s.id;
      const exists = await CircuitDepense.findOne({ where: { circuit_ref: circuitRef, etape: 1 } });
      if (!exists) {
        await CircuitDepense.create({
          circuit_ref: circuitRef,
          etape: 1,
          libelle_etape: ETAPES[1],
          soumission_besoins_id: s.id,
          date_etape: s.created_at || new Date(),
          created_by: s.demandeur_id
        });
        created++;
      }
    }

    // 2. Étape 2 : demandes de fonds
    const demandes = await DemandeFonds.findAll({
      where: { statut: 'approuvee' },
      order: [['created_at', 'ASC']]
    });
    const soumissionsApprouvees = await SoumissionBesoins.findAll({
      where: { type: 'fonds', statut: 'approuvee' },
      order: [['date_validation', 'ASC']]
    });
    for (const d of demandes) {
      let soumissionId = null;
      const motif = (d.motif || '') + ' ' + (d.commentaire || '');
      const match = motif.match(/Soumission\s*besoins?\s*#?\s*(\d+)/i);
      if (match) soumissionId = parseInt(match[1], 10);
      else {
        const dDate = d.created_at ? new Date(d.created_at).getTime() : 0;
        const candidates = soumissionsApprouvees.filter((s) => {
          if (s.demandeur_id !== d.demandeur_id || s.superviseur_id !== d.superviseur_id) return false;
          const sDate = s.date_validation ? new Date(s.date_validation).getTime() : 0;
          if (Math.abs(dDate - sDate) > 10 * 60 * 1000) return false;
          return Math.abs(parseFloat(s.montant_total || 0) - parseFloat(d.montant_total || 0)) < 0.02;
        });
        if (candidates.length >= 1) {
          const closest = candidates.reduce((a, b) =>
            Math.abs(new Date(b.date_validation).getTime() - dDate) < Math.abs(new Date(a.date_validation).getTime() - dDate) ? b : a
          );
          soumissionId = closest.id;
        }
      }
      if (!soumissionId) continue;
      const circuitRef = 'SB-' + soumissionId;
      const exists = await CircuitDepense.findOne({ where: { demande_fonds_id: d.id, etape: 2 } });
      if (!exists) {
        await CircuitDepense.create({
          circuit_ref: circuitRef,
          etape: 2,
          libelle_etape: ETAPES[2],
          demande_fonds_id: d.id,
          date_etape: d.date_validation || d.created_at || new Date(),
          created_by: d.superviseur_id
        });
        created++;
      }
    }

    // 3. Étapes 3–6 : dépenses
    const depenses = await Depense.findAll({ order: [['id', 'ASC']] });
    for (const dep of depenses) {
      const notes = (dep.notes || '') + ' ' + (dep.description || '');
      const match = notes.match(/demande\s*de\s*fonds\s*#?\s*(\d+)/i) || notes.match(/Demande de fonds approuvée #(\d+)/i);
      const demandeId = match ? parseInt(match[1], 10) : null;
      if (!demandeId) continue;
      const rowEtape2 = await CircuitDepense.findOne({
        where: { demande_fonds_id: demandeId, etape: 2 },
        attributes: ['circuit_ref']
      });
      const circuitRef = rowEtape2 ? rowEtape2.circuit_ref : null;
      if (!circuitRef) continue;

      const depId = dep.id;
      const dateBase = dep.date_paiement || dep.updated_at || dep.created_at || new Date();

      if (!(await CircuitDepense.findOne({ where: { depense_id: depId, etape: 3 } }))) {
        await CircuitDepense.create({
          circuit_ref: circuitRef,
          etape: 3,
          libelle_etape: ETAPES[3],
          depense_id: depId,
          date_etape: dep.created_at || dateBase,
          created_by: dep.approbateur_id
        });
        created++;
      }
      if ((dep.statut === 'Approuvée' || dep.statut === 'Payée') && !(await CircuitDepense.findOne({ where: { depense_id: depId, etape: 4 } }))) {
        await CircuitDepense.create({
          circuit_ref: circuitRef,
          etape: 4,
          libelle_etape: ETAPES[4],
          depense_id: depId,
          date_etape: dep.updated_at || dateBase,
          created_by: dep.approbateur_id
        });
        created++;
      }
      if (dep.date_paiement_prevue && !(await CircuitDepense.findOne({ where: { depense_id: depId, etape: 5 } }))) {
        await CircuitDepense.create({
          circuit_ref: circuitRef,
          etape: 5,
          libelle_etape: ETAPES[5],
          depense_id: depId,
          date_etape: dep.updated_at || dateBase,
          created_by: dep.responsable_paiement_id || dep.approbateur_id
        });
        created++;
      }
      if (dep.statut === 'Payée' && !(await CircuitDepense.findOne({ where: { depense_id: depId, etape: 6 } }))) {
        await CircuitDepense.create({
          circuit_ref: circuitRef,
          etape: 6,
          libelle_etape: ETAPES[6],
          depense_id: depId,
          date_etape: dep.date_paiement || dep.updated_at || dateBase,
          created_by: dep.responsable_paiement_id || dep.approbateur_id
        });
        created++;
      }
    }

    res.json({ success: true, created, message: `${created} étape(s) créée(s)` });
  } catch (error) {
    console.error('POST circuits-depenses/backfill:', error);
    res.status(500).json({ success: false, message: error.message || 'Erreur lors du backfill' });
  }
});

module.exports = router;

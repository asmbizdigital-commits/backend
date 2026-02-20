#!/usr/bin/env node
/**
 * Backfill des circuits de dépenses à partir des soumissions/demandes/dépenses existantes.
 * À exécuter si la table tbl_circuits_depenses existait mais était vide lors des opérations
 * (ex: déploiement du code circuit après les premiers traitements).
 *
 * Usage: node backend/scripts/backfill-circuits-depenses.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env.production') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { sequelize } = require('../server/config/database');
require('../server/models/index');
const { CircuitDepense, SoumissionBesoins, DemandeFonds, Depense } = require('../server/models');

const ETAPES = {
  1: 'Soumission besoin (fonds)',
  2: 'Demande de fonds créée',
  3: 'Décaissement en attente',
  4: 'Décaissement approuvé par auditeur',
  5: 'Paiement validé par le patron',
  6: 'Validation paiement par le Patron'
};

async function backfill() {
  try {
    console.log('🔄 Backfill des circuits de dépenses...\n');
    await sequelize.authenticate();

    let created = 0;

    // 1. Étape 1 : soumissions type fonds
    const soumissions = await SoumissionBesoins.findAll({
      where: { type: 'fonds' },
      order: [['id', 'ASC']]
    });
    for (const s of soumissions) {
      const circuitRef = 'SB-' + s.id;
      const exists = await CircuitDepense.findOne({
        where: { circuit_ref: circuitRef, etape: 1 }
      });
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
        console.log(`  ✓ Étape 1 créée pour SB-${s.id}`);
      }
    }

    // 2. Étape 2 : demandes de fonds (lien via motif "Soumission besoins #X" ou heuristique)
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
      if (match) {
        soumissionId = parseInt(match[1], 10);
      } else {
        // Heuristique : même demandeur, même superviseur, date proche, montant similaire
        const dDate = d.created_at ? new Date(d.created_at).getTime() : 0;
        const candidates = soumissionsApprouvees.filter((s) => {
          if (s.demandeur_id !== d.demandeur_id || s.superviseur_id !== d.superviseur_id) return false;
          const sDate = s.date_validation ? new Date(s.date_validation).getTime() : 0;
          if (Math.abs(dDate - sDate) > 10 * 60 * 1000) return false; // 10 min
          const mS = parseFloat(s.montant_total || 0);
          const mD = parseFloat(d.montant_total || 0);
          return Math.abs(mS - mD) < 0.02; // tolérance
        });
        if (candidates.length === 1) soumissionId = candidates[0].id;
        else if (candidates.length > 1) {
          const closest = candidates.reduce((a, b) =>
            Math.abs(new Date(b.date_validation).getTime() - dDate) < Math.abs(new Date(a.date_validation).getTime() - dDate) ? b : a
          );
          soumissionId = closest.id;
        }
      }
      const circuitRef = soumissionId ? 'SB-' + soumissionId : null;
      if (!circuitRef) continue;

      const exists = await CircuitDepense.findOne({
        where: { demande_fonds_id: d.id, etape: 2 }
      });
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
        console.log(`  ✓ Étape 2 créée pour DemandeFonds #${d.id} → ${circuitRef}`);
      }
    }

    // 3. Étapes 3–6 : dépenses (lien via notes "demande de fonds #X")
    const depenses = await Depense.findAll({
      order: [['id', 'ASC']]
    });
    for (const dep of depenses) {
      const notes = (dep.notes || '') + ' ' + (dep.description || '');
      const match = notes.match(/demande\s*de\s*fonds\s*#?\s*(\d+)/i) || notes.match(/Demande de fonds approuvée #(\d+)/i);
      const demandeId = match ? parseInt(match[1], 10) : null;

      if (!demandeId) continue;

      // Récupérer circuit_ref depuis l'étape 2
      const rowEtape2 = await CircuitDepense.findOne({
        where: { demande_fonds_id: demandeId, etape: 2 },
        attributes: ['circuit_ref']
      });
      const circuitRef = rowEtape2 ? rowEtape2.circuit_ref : null;
      if (!circuitRef) continue;

      const depId = dep.id;
      const dateBase = dep.date_paiement || dep.updated_at || dep.created_at || new Date();

      // Étape 3 : décaissement en attente (toujours si on a une dépense liée)
      let etape3 = await CircuitDepense.findOne({ where: { depense_id: depId, etape: 3 } });
      if (!etape3) {
        await CircuitDepense.create({
          circuit_ref: circuitRef,
          etape: 3,
          libelle_etape: ETAPES[3],
          depense_id: depId,
          date_etape: dep.created_at || dateBase,
          created_by: dep.approbateur_id
        });
        created++;
        console.log(`  ✓ Étape 3 créée pour Dépense #${depId} → ${circuitRef}`);
      }

      // Étape 4 : approuvé (si statut Approuvée ou Payée)
      if (dep.statut === 'Approuvée' || dep.statut === 'Payée') {
        let etape4 = await CircuitDepense.findOne({ where: { depense_id: depId, etape: 4 } });
        if (!etape4) {
          await CircuitDepense.create({
            circuit_ref: circuitRef,
            etape: 4,
            libelle_etape: ETAPES[4],
            depense_id: depId,
            date_etape: dep.updated_at || dateBase,
            created_by: dep.approbateur_id
          });
          created++;
          console.log(`  ✓ Étape 4 créée pour Dépense #${depId}`);
        }
      }

      // Étape 5 : paiement effectué (si statut Payée)
      if (dep.statut === 'Payée') {
        let etape5 = await CircuitDepense.findOne({ where: { depense_id: depId, etape: 5 } });
        if (!etape5) {
          await CircuitDepense.create({
            circuit_ref: circuitRef,
            etape: 5,
            libelle_etape: ETAPES[5],
            depense_id: depId,
            date_etape: dep.date_paiement || dep.updated_at || dateBase,
            created_by: dep.responsable_paiement_id || dep.approbateur_id
          });
          created++;
          console.log(`  ✓ Étape 5 créée pour Dépense #${depId}`);
        }
      }

      // Étape 6 : validation paiement par le Patron (si date_paiement_prevue)
      if (dep.date_paiement_prevue) {
        let etape6 = await CircuitDepense.findOne({ where: { depense_id: depId, etape: 6 } });
        if (!etape6) {
          await CircuitDepense.create({
            circuit_ref: circuitRef,
            etape: 6,
            libelle_etape: ETAPES[6],
            depense_id: depId,
            date_etape: dep.updated_at || dateBase,
            created_by: dep.responsable_paiement_id || dep.approbateur_id
          });
          created++;
          console.log(`  ✓ Étape 6 créée pour Dépense #${depId}`);
        }
      }
    }

    console.log(`\n✅ Backfill terminé. ${created} étape(s) créée(s).`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Erreur backfill:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

backfill();

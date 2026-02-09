/**
 * Corrige les écritures comptables déjà créées à partir de factures en USD :
 * les montants enregistrés (ex. 2320, 1160) sont convertis en FC au taux 1 USD = 2200 FC.
 * Les factures déjà en FC ne sont pas modifiées.
 *
 * Exécuter depuis la racine : node backend/scripts/fix-ecritures-factures-usd-to-fc.js
 * Ou depuis backend : node scripts/fix-ecritures-factures-usd-to-fc.js
 */
const path = require('path');
const { Op } = require('sequelize');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const FactureFin = require('../server/models/FactureFin');
const EcritureFin = require('../server/models/EcritureFin');
const LigneEcritureFin = require('../server/models/LigneEcritureFin');
const { sequelize } = require('../server/config/database');

const TAUX_USD_FC = Number(process.env.TAUX_USD_FC) || 2200;

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Connexion DB OK.\n');
    console.log(`Taux de conversion : 1 USD = ${TAUX_USD_FC} FC\n`);

    const facturesUsd = await FactureFin.findAll({
      where: {
        ecriture_id: { [Op.ne]: null },
        devise: { [Op.ne]: 'FC' }
      }
    });

    if (facturesUsd.length === 0) {
      console.log('Aucune facture en devise autre que FC avec écriture associée. Rien à corriger.');
      process.exit(0);
      return;
    }

    console.log(`${facturesUsd.length} facture(s) en devise non-FC avec écriture à corriger.\n`);

    for (const facture of facturesUsd) {
      const devise = (facture.devise || '').trim().toUpperCase();
      const totalTtc = parseFloat(facture.total_ttc || 0);
      const montantFC = totalTtc * TAUX_USD_FC;

      const ecriture = await EcritureFin.findByPk(facture.ecriture_id);
      if (!ecriture) {
        console.log(`  ⚠ Facture ${facture.numero}: écriture introuvable, ignorée.`);
        continue;
      }
      const lignes = await LigneEcritureFin.findAll({ where: { ecriture_id: facture.ecriture_id } });
      if (!lignes || lignes.length === 0) {
        console.log(`  ⚠ Facture ${facture.numero}: aucune ligne d'écriture, ignorée.`);
        continue;
      }

      for (const ligne of lignes) {
        const ancienDebit = parseFloat(ligne.debit || 0);
        const ancienCredit = parseFloat(ligne.credit || 0);
        const updates = {};
        if (ancienDebit > 0) updates.debit = montantFC;
        if (ancienCredit > 0) updates.credit = montantFC;
        if (Object.keys(updates).length) await ligne.update(updates);
      }

      const nouveauLibelle = `Facture client ${facture.client_nom} (${totalTtc} ${devise} = ${Math.round(montantFC)} FC)`;
      await ecriture.update({ libelle: nouveauLibelle });

      console.log(`  ✓ ${facture.numero}: ${totalTtc} ${devise} → ${montantFC.toFixed(0)} FC`);
    }

    console.log('\nCorrection terminée.');
    process.exit(0);
  } catch (err) {
    console.error('Erreur:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();

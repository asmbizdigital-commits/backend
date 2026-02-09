/**
 * Corrige les écritures d'encaissement 200 USD qui ont été passées en 200 FC (au lieu de 440 000 FC au taux 2200).
 * - Remplace 200 FC par 440 000 FC sur les lignes trésorerie et produit (compte en FC).
 * - Assure le bon signe : trésorerie en débit, produit en crédit.
 * Exécuter depuis la racine du backend: node scripts/fix-tresorerie-200-usd-en-fc.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { sequelize } = require('../server/config/database');
const { QueryTypes } = require('sequelize');

const TAUX_USD_FC = 2200;

async function run() {
  try {
    console.log('Correction 200 USD → 440 000 FC (taux 2200) sur écritures factures...\n');
    await sequelize.authenticate();

    // Écritures liées à une facture USD avec total_ttc = 200
    const factures = await sequelize.query(
      `SELECT id, numero, devise, total_ttc, ecriture_id FROM tbl_fin_factures
       WHERE devise = 'USD' AND CAST(total_ttc AS DECIMAL(15,2)) = 200 AND ecriture_id IS NOT NULL`,
      { type: QueryTypes.SELECT }
    );

    if (factures.length === 0) {
      console.log('Aucune facture USD 200 avec écriture trouvée.');
    } else {
      for (const f of factures) {
        const ecritureId = f.ecriture_id;
        // Lignes de cette écriture avec le compte (type + devise)
        const lignes = await sequelize.query(
          `SELECT l.id AS ligne_id, l.compte_id, l.debit, l.credit, c.type_compte, c.devise
           FROM tbl_fin_lignes_ecriture l
           INNER JOIN tbl_fin_comptes c ON c.id = l.compte_id
           WHERE l.ecriture_id = :ecritureId`,
          { replacements: { ecritureId }, type: QueryTypes.SELECT }
        );

        const ligneTreso = lignes.find((r) => r.type_compte === 'tresorerie');
        const ligneProd = lignes.find((r) => r.type_compte === 'produit');
        if (!ligneTreso || !ligneProd) continue;

        const montantTreso = parseFloat(ligneTreso.debit || 0) || parseFloat(ligneTreso.credit || 0);
        const deviseTreso = (ligneTreso.devise || 'FC').trim().toUpperCase();

        // Cas : trésorerie en FC avec montant 200 → remplacer par 440 000 et bon signe
        if (deviseTreso === 'FC' && montantTreso === 200) {
          const montantFC = 200 * TAUX_USD_FC; // 440000
          await sequelize.query(
            `UPDATE tbl_fin_lignes_ecriture SET debit = :montant, credit = 0 WHERE id = :id`,
            { replacements: { montant: montantFC, id: ligneTreso.ligne_id } }
          );
          await sequelize.query(
            `UPDATE tbl_fin_lignes_ecriture SET debit = 0, credit = :montant WHERE id = :id`,
            { replacements: { montant: montantFC, id: ligneProd.ligne_id } }
          );
          console.log(`Facture ${f.numero} (écriture ${ecritureId}) : 200 FC → ${montantFC} FC (trésorerie débit, produit crédit).`);
        } else if (deviseTreso === 'FC' && montantTreso === 440000) {
          // Déjà corrigé en montant, vérifier le signe
          if (parseFloat(ligneTreso.credit || 0) > 0) {
            await sequelize.query(
              `UPDATE tbl_fin_lignes_ecriture SET debit = credit, credit = 0 WHERE id = :id`,
              { replacements: { id: ligneTreso.ligne_id } }
            );
            await sequelize.query(
              `UPDATE tbl_fin_lignes_ecriture SET credit = debit, debit = 0 WHERE id = :id`,
              { replacements: { id: ligneProd.ligne_id } }
            );
            console.log(`Facture ${f.numero} (écriture ${ecritureId}) : signe corrigé (trésorerie en débit).`);
          }
        } else if (deviseTreso === 'USD' && parseFloat(ligneTreso.credit || 0) > 0) {
          // Trésorerie en USD mais en crédit (mauvais signe) → inverser
          await sequelize.query(
            `UPDATE tbl_fin_lignes_ecriture SET debit = credit, credit = 0 WHERE id = :id`,
            { replacements: { id: ligneTreso.ligne_id } }
          );
          await sequelize.query(
            `UPDATE tbl_fin_lignes_ecriture SET credit = debit, debit = 0 WHERE id = :id`,
            { replacements: { id: ligneProd.ligne_id } }
          );
          console.log(`Facture ${f.numero} (écriture ${ecritureId}) : signe corrigé (trésorerie USD en débit).`);
        }
      }
    }

    // Ensuite : correction signe pour toutes les autres écritures "facture payée" (trésorerie crédit → débit)
    const ecrituresToFix = await sequelize.query(
      `SELECT DISTINCT l.ecriture_id
       FROM tbl_fin_lignes_ecriture l
       INNER JOIN tbl_fin_comptes c ON c.id = l.compte_id
       WHERE c.type_compte = 'tresorerie' AND l.credit > 0
       AND EXISTS (
         SELECT 1 FROM tbl_fin_lignes_ecriture l2
         INNER JOIN tbl_fin_comptes c2 ON c2.id = l2.compte_id
         WHERE l2.ecriture_id = l.ecriture_id AND c2.type_compte = 'produit' AND l2.debit > 0
       )`,
      { type: QueryTypes.SELECT }
    );

    const ids = ecrituresToFix.map((r) => r.ecriture_id);
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      await sequelize.query(
        `UPDATE tbl_fin_lignes_ecriture l
         INNER JOIN tbl_fin_comptes c ON c.id = l.compte_id
         SET l.debit = l.credit, l.credit = 0
         WHERE c.type_compte = 'tresorerie' AND l.credit > 0
         AND l.ecriture_id IN (${placeholders})`,
        { replacements: ids }
      );
      await sequelize.query(
        `UPDATE tbl_fin_lignes_ecriture l
         INNER JOIN tbl_fin_comptes c ON c.id = l.compte_id
         SET l.credit = l.debit, l.debit = 0
         WHERE c.type_compte = 'produit' AND l.debit > 0
         AND l.ecriture_id IN (${placeholders})`,
        { replacements: ids }
      );
      console.log('Écritures (signe seul) corrigées:', ids.length);
    }

    console.log('\nTerminé.');
    process.exit(0);
  } catch (err) {
    console.error('Erreur:', err.message || err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();

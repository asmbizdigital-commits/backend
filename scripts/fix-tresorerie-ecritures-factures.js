/**
 * Corrige les écritures "facture payée" créées avec l'ancienne logique (trésorerie en crédit au lieu de débit).
 * Inverse débit/crédit sur les lignes trésorerie et produit pour ces écritures.
 * Exécuter depuis la racine du backend: node scripts/fix-tresorerie-ecritures-factures.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { sequelize } = require('../server/config/database');
const { QueryTypes } = require('sequelize');

async function run() {
  try {
    console.log('Correction des écritures facture payée (trésorerie débit/crédit)...\n');
    await sequelize.authenticate();

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
    if (ids.length === 0) {
      console.log('Aucune écriture à corriger.');
      process.exit(0);
      return;
    }

    const placeholders = ids.map(() => '?').join(',');
    const [updatedTresorerie] = await sequelize.query(
      `UPDATE tbl_fin_lignes_ecriture l
       INNER JOIN tbl_fin_comptes c ON c.id = l.compte_id
       SET l.debit = l.credit, l.credit = 0
       WHERE c.type_compte = 'tresorerie' AND l.credit > 0
       AND l.ecriture_id IN (${placeholders})`,
      { replacements: ids }
    );
    const [updatedProduit] = await sequelize.query(
      `UPDATE tbl_fin_lignes_ecriture l
       INNER JOIN tbl_fin_comptes c ON c.id = l.compte_id
       SET l.credit = l.debit, l.debit = 0
       WHERE c.type_compte = 'produit' AND l.debit > 0
       AND l.ecriture_id IN (${placeholders})`,
      { replacements: ids }
    );

    console.log('Écritures corrigées:', ids.length);
    console.log('Lignes trésorerie mises à jour:', updatedTresorerie?.affectedRows ?? updatedTresorerie ?? '?');
    console.log('Lignes produit mises à jour:', updatedProduit?.affectedRows ?? updatedProduit ?? '?');
    process.exit(0);
  } catch (err) {
    console.error('Erreur:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();

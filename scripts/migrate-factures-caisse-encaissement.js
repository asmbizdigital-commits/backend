/**
 * Migration: ajouter caisse_id et encaissement_id à tbl_fin_factures (lier facture payée à une caisse)
 * Exécuter depuis la racine du backend: node scripts/migrate-factures-caisse-encaissement.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { sequelize } = require('../server/config/database');

const statements = [
  `ALTER TABLE tbl_fin_factures
   ADD COLUMN caisse_id int(11) NULL COMMENT 'Caisse dans laquelle la facture a été encaissée' AFTER ecriture_id,
   ADD COLUMN encaissement_id int(11) NULL COMMENT 'Encaissement créé pour cette facture' AFTER caisse_id`,
  `ALTER TABLE tbl_fin_factures
   ADD KEY idx_fin_factures_caisse (caisse_id),
   ADD KEY idx_fin_factures_encaissement (encaissement_id)`,
  `ALTER TABLE tbl_fin_factures
   ADD CONSTRAINT fk_fin_factures_caisse FOREIGN KEY (caisse_id) REFERENCES tbl_caisses (id) ON DELETE SET NULL ON UPDATE CASCADE,
   ADD CONSTRAINT fk_fin_factures_encaissement FOREIGN KEY (encaissement_id) REFERENCES tbl_encaissements (id) ON DELETE SET NULL ON UPDATE CASCADE`
];

async function runMigration() {
  try {
    console.log('Migration: ajout caisse_id et encaissement_id à tbl_fin_factures\n');
    await sequelize.authenticate();
    for (let i = 0; i < statements.length; i++) {
      try {
        console.log(`Exécution ${i + 1}/${statements.length}...`);
        await sequelize.query(statements[i], { raw: true });
        console.log('OK\n');
      } catch (err) {
        const msg = (err.message || '').toLowerCase();
        if (msg.includes('duplicate column') || msg.includes('duplicate key') || msg.includes('already exists')) {
          console.log('Déjà appliqué, ignoré.\n');
        } else throw err;
      }
    }
    console.log('Migration terminée.');
    process.exit(0);
  } catch (err) {
    console.error('Erreur:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

runMigration();

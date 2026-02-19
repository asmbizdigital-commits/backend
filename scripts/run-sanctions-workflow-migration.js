/**
 * Migration : circuit de sanctions (nouveaux statuts + colonnes étapes).
 * Exécuter depuis la racine du projet : node backend/scripts/run-sanctions-workflow-migration.js
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { sequelize } = require('../server/config/database');

async function run() {
  console.log('Migration tbl_sanctions_pro : circuit de sanctions (workflow)...\n');
  const sqlPath = path.join(__dirname, '..', 'database', 'alter_tbl_sanctions_pro_workflow.sql');
  const fullSql = fs.readFileSync(sqlPath, 'utf8');
  // Découper par ";\n" ou ";\r\n" pour obtenir des statements complets (éviter de couper dans les ENUM)
  const statements = fullSql
    .split(/\s*;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (let i = 0; i < statements.length; i++) {
    const st = statements[i];
    if (!st.startsWith('ALTER') && !st.startsWith('CREATE')) continue;
    const sql = st.endsWith(';') ? st : st + ';';
    try {
      await sequelize.query(sql);
      console.log('OK:', sql.substring(0, 70).replace(/\n/g, ' ') + '...');
    } catch (e) {
      if (e.message && (e.message.includes('Duplicate') || e.message.includes('already exists'))) {
        console.log('Skip (déjà appliqué):', sql.substring(0, 50));
      } else {
        console.error('Erreur:', e.message);
        throw e;
      }
    }
  }
  console.log('\nMigration terminée.');
  await sequelize.close();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Exécute uniquement la migration tbl_proforma (si MySQL est accessible)
// Utiliser DOTENV_PATH=.env.production pour migrer avec les credentials production
const path = require('path');
const envFile = process.env.DOTENV_PATH || '.env';
require('dotenv').config({ path: path.join(__dirname, '..', envFile) });
const { sequelize } = require('../server/config/database');
const { Sequelize } = require('sequelize');
const MIGRATION_NAME = '20260221000000-create-tbl-proforma.js';

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Connexion DB OK');

    const queryInterface = sequelize.getQueryInterface();
    const migrationPath = path.join(__dirname, '..', 'migrations', MIGRATION_NAME);
    const migration = require(migrationPath);

    const executed = await sequelize.query("SELECT name FROM SequelizeMeta WHERE name = ?", {
      replacements: [MIGRATION_NAME]
    });
    const list = Array.isArray(executed) ? executed[0] : executed;
    const alreadyRun = Array.isArray(list) && list.length > 0;

    if (alreadyRun) {
      console.log(MIGRATION_NAME, '- déjà exécutée, rien à faire.');
      process.exit(0);
      return;
    }

    console.log('Exécution de', MIGRATION_NAME, '...');
    await migration.up(queryInterface, Sequelize);
    await sequelize.query("INSERT INTO SequelizeMeta (name) VALUES (?)", {
      replacements: [MIGRATION_NAME]
    });
    console.log('OK - tbl_proforma et tbl_proforma_lignes créées.');
  } catch (err) {
    console.error('Erreur:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();

// Exécute uniquement la migration tbl_liaisons_caissiers
require('dotenv').config();
const { sequelize } = require('../server/config/database');
const { Sequelize } = require('sequelize');
const path = require('path');

const MIGRATION_NAME = '20260220000000-create-tbl-liaisons-caissiers.js';

async function run() {
  try {
    console.log('🔍 Connexion à la base de données...');
    await sequelize.authenticate();
    console.log('✅ Connexion réussie\n');

    const queryInterface = sequelize.getQueryInterface();

    // Créer SequelizeMeta si besoin
    try {
      await queryInterface.createTable('SequelizeMeta', {
        name: { type: Sequelize.STRING, allowNull: false, primaryKey: true }
      });
    } catch (e) {
      if (!e.message || !e.message.includes('already exists')) throw e;
    }

    // Vérifier si déjà exécutée
    const executed = await sequelize.query(
      'SELECT name FROM SequelizeMeta',
      { type: Sequelize.QueryTypes.SELECT }
    );
    const names = (Array.isArray(executed) ? executed : []).map((r) => r.name);
    if (names.includes(MIGRATION_NAME)) {
      console.log(`⏭️  ${MIGRATION_NAME} - déjà exécutée. Rien à faire.`);
      process.exit(0);
      return;
    }

    console.log(`🔄 Exécution de ${MIGRATION_NAME} (tbl_liaisons_caissiers)...`);
    const migration = require(path.join(__dirname, '..', 'migrations', MIGRATION_NAME));
    await migration.up(queryInterface, Sequelize);

    await queryInterface.sequelize.query(
      `INSERT INTO SequelizeMeta (name) VALUES ('${MIGRATION_NAME}')`
    );

    console.log('✅ Table tbl_liaisons_caissiers créée avec succès.\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();

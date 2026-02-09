const fs = require('fs');
const path = require('path');

// Charger .env du backend (user, password, host)
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
// Toujours cibler asmdb pour cette migration
process.env.DB_NAME = 'asmdb';

const { sequelize } = require('../server/config/database');

async function runMigration() {
  try {
    console.log('🚀 Migration des tables redevances mines (tbl_redevances_mines, tbl_paiements_redevances)...\n');

    await sequelize.authenticate();
    console.log('✅ Connexion à la base de données réussie\n');

    const sqlPath = path.join(__dirname, '../../database/create_tbl_redevances_mines.sql');
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`Fichier SQL non trouvé: ${sqlPath}`);
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    const cleanSql = sql
      .split('\n')
      .map((line) => {
        const i = line.indexOf('--');
        return i !== -1 ? line.substring(0, i).trim() : line.trim();
      })
      .filter((line) => line.length > 0)
      .join('\n');

    const createTableRegex = /CREATE TABLE[^;]+;/gi;
    const commands = cleanSql.match(createTableRegex) || [];
    if (commands.length === 0) {
      throw new Error('Aucune commande CREATE TABLE trouvée');
    }

    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i].trim();
      if (!cmd) continue;
      try {
        console.log(`🔄 Exécution ${i + 1}/${commands.length}...`);
        await sequelize.query(cmd, { raw: true });
        console.log(`✅ OK\n`);
      } catch (err) {
        if (err.message.includes('already exists') || err.message.includes('Duplicate')) {
          console.log(`⚠️  Table déjà existante, ignoré.\n`);
        } else {
          throw err;
        }
      }
    }

    const [t1] = await sequelize.query(`
      SELECT COUNT(*) as c FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'tbl_redevances_mines'
    `);
    const [t2] = await sequelize.query(`
      SELECT COUNT(*) as c FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'tbl_paiements_redevances'
    `);

    if (t1[0].c > 0 && t2[0].c > 0) {
      console.log('✅ tbl_redevances_mines et tbl_paiements_redevances créées avec succès.');
    } else {
      throw new Error('Vérification des tables échouée');
    }

    console.log('\n🎉 Migration terminée avec succès.');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erreur:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

runMigration();

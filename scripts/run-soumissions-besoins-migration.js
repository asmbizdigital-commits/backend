const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
process.env.DB_NAME = process.env.DB_NAME || 'asmdb';

const { sequelize } = require('../server/config/database');

async function runMigration() {
  try {
    console.log('🚀 Migration tables soumissions besoins (tbl_soumissions_besoins, tbl_soumissions_besoins_lignes)...\n');

    await sequelize.authenticate();
    console.log('✅ Connexion à la base de données réussie\n');

    const sqlPath = path.join(__dirname, '../database/migration_tbl_soumissions_besoins.sql');
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
    if (commands.length === 0) throw new Error('Aucune commande CREATE TABLE trouvée');

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
        } else throw err;
      }
    }

    const [t] = await sequelize.query(`
      SELECT COUNT(*) as c FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'tbl_soumissions_besoins'
    `);
    if (t[0].c > 0) console.log('✅ tbl_soumissions_besoins créée avec succès.');
    else throw new Error('Vérification table échouée');

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

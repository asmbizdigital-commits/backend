const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
process.env.DB_NAME = process.env.DB_NAME || 'asmdb';

const { sequelize } = require('../server/config/database');

async function runMigration() {
  try {
    console.log('🚀 Migration tbl_sanctions_pro: ajout colonne documents (pièces justificatives)...\n');

    await sequelize.authenticate();
    console.log('✅ Connexion à la base de données réussie\n');

    const sqlPath = path.join(__dirname, '../database/alter_tbl_sanctions_pro_add_documents.sql');
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`Fichier SQL non trouvé: ${sqlPath}`);
    }

    let sql = fs.readFileSync(sqlPath, 'utf8');
    sql = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .trim();
    const alterMatch = sql.match(/ALTER TABLE[\s\S]+?;/);
    const alterSql = alterMatch ? alterMatch[0].trim() : sql;
    if (!alterSql.startsWith('ALTER TABLE')) {
      throw new Error('Commande ALTER TABLE non trouvée dans le fichier SQL');
    }

    try {
      await sequelize.query(alterSql, { raw: true });
      console.log('✅ Colonne documents ajoutée à tbl_sanctions_pro.\n');
    } catch (err) {
      if (err.message && (err.message.includes('Duplicate column') || err.message.includes('already exists'))) {
        console.log('⚠️  Colonne documents déjà présente, rien à faire.\n');
      } else {
        throw err;
      }
    }

    const [rows] = await sequelize.query(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE table_schema = DATABASE() AND table_name = 'tbl_sanctions_pro' AND COLUMN_NAME = 'documents'
    `);
    if (rows.length > 0) {
      console.log('✅ Vérification: colonne documents présente.');
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

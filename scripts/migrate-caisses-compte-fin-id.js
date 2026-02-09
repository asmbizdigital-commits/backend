/**
 * Migration: ajouter compte_fin_id à tbl_caisses (liaison au plan comptable Finances)
 * Exécuter depuis la racine du backend: node scripts/migrate-caisses-compte-fin-id.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { sequelize } = require('../server/config/database');

const SQL_PATH = path.join(__dirname, '../../database/migration_add_compte_fin_id_to_caisses.sql');

async function runMigration() {
  try {
    console.log('🚀 Migration: ajout de compte_fin_id à tbl_caisses (liaison Finances)\n');

    await sequelize.authenticate();
    console.log('✅ Connexion à la base de données OK\n');

    if (!fs.existsSync(SQL_PATH)) {
      throw new Error(`Fichier SQL introuvable: ${SQL_PATH}`);
    }

    const sql = fs.readFileSync(SQL_PATH, 'utf8');
    // Extraire les commandes ALTER TABLE (une par bloc terminé par ;)
    const commands = sql
      .split(';')
      .map((s) => s.replace(/--[^\n]*/g, '').trim())
      .filter((s) => s.length > 0 && s.toUpperCase().includes('ALTER TABLE'));

    console.log(`📄 ${commands.length} commande(s) ALTER TABLE trouvée(s)\n`);

    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i].trim() + ';';
      try {
        console.log(`🔄 Exécution ${i + 1}/${commands.length}...`);
        await sequelize.query(cmd, { raw: true });
        console.log(`✅ OK\n`);
      } catch (err) {
        const msg = (err.message || '').toLowerCase();
        if (
          msg.includes('duplicate column') ||
          msg.includes('duplicate key') ||
          msg.includes('already exists') ||
          msg.includes('errno: 1060') ||
          msg.includes('errno: 1061')
        ) {
          console.log(`⚠️  Déjà appliqué, ignoré.\n`);
        } else {
          throw err;
        }
      }
    }

    const [cols] = await sequelize.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_caisses' AND COLUMN_NAME = 'compte_fin_id'`
    );
    if (cols.length > 0) {
      console.log('✅ Colonne compte_fin_id présente dans tbl_caisses.\n');
    } else {
      console.log('⚠️  Colonne compte_fin_id non trouvée (vérifier les erreurs ci-dessus).\n');
    }

    console.log('🎉 Migration terminée.');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Erreur:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

runMigration();

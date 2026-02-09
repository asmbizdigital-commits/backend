/**
 * Migration: créer tbl_fin_factures et tbl_fin_facture_lignes (module Finances - Facturation)
 * Exécuter depuis la racine du backend: node scripts/migrate-fin-factures.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { sequelize } = require('../server/config/database');

const SQL_PATH = path.join(__dirname, '../../database/migration_create_tbl_fin_factures.sql');

async function runMigration() {
  try {
    console.log('🚀 Migration: création des tables facturation (tbl_fin_factures, tbl_fin_facture_lignes)\n');

    await sequelize.authenticate();
    console.log('✅ Connexion à la base de données OK\n');

    if (!fs.existsSync(SQL_PATH)) {
      throw new Error(`Fichier SQL introuvable: ${SQL_PATH}`);
    }

    const sql = fs.readFileSync(SQL_PATH, 'utf8');
    const commands = sql
      .split(';')
      .map((s) => s.replace(/--[^\n]*/g, '').trim())
      .filter((s) => s.length > 0 && (s.toUpperCase().includes('CREATE TABLE') || s.toUpperCase().includes('INSERT')));

    console.log(`📄 ${commands.length} commande(s) trouvée(s)\n`);

    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i].trim() + (commands[i].trim().endsWith(';') ? '' : ';');
      try {
        console.log(`🔄 Exécution ${i + 1}/${commands.length}...`);
        await sequelize.query(cmd, { raw: true });
        console.log(`✅ OK\n`);
      } catch (err) {
        const msg = (err.message || '').toLowerCase();
        if (msg.includes('already exists') || msg.includes('duplicate')) {
          console.log(`⚠️  Déjà existant, ignoré.\n`);
        } else {
          throw err;
        }
      }
    }

    const [tables] = await sequelize.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('tbl_fin_factures', 'tbl_fin_facture_lignes')`
    );
    console.log('✅ Tables créées:', tables.map((t) => t.TABLE_NAME).join(', '));
    console.log('\n🎉 Migration facturation terminée.');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Erreur:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

runMigration();

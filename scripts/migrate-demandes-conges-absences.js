const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { sequelize } = require('../server/config/database');

const DB_NAME = process.env.DB_NAME || 'hotel_beatrice';

async function runDemandesCongesAbsencesMigration() {
  try {
    console.log('🚀 Démarrage de la migration des tables tbl_demandes_conges et tbl_absences...\n');
    console.log(`🗄️  Base de données: ${DB_NAME}\n`);

    // Vérifier la connexion à la base de données
    await sequelize.authenticate();
    console.log('✅ Connexion à la base de données réussie\n');

    // Lire le fichier SQL
    const sqlFilePath = path.join(__dirname, '../../database/create_tbl_demandes_conges_absences.sql');
    
    if (!fs.existsSync(sqlFilePath)) {
      throw new Error(`Fichier SQL non trouvé: ${sqlFilePath}`);
    }

    const sql = fs.readFileSync(sqlFilePath, 'utf8');
    console.log('📄 Lecture du fichier de migration...');

    // Chaque CREATE TABLE se termine par ";\n" — on découpe sur ce motif puis on garde les blocs contenant CREATE TABLE
    const parts = sql.split(/;\s*\n/);
    const createBlocks = parts
      .map(p => p.trim())
      .filter(p => p.includes('CREATE TABLE'))
      .map(p => {
        const fromCreate = p.includes('CREATE TABLE') ? p.slice(p.indexOf('CREATE TABLE')) : p;
        return fromCreate.endsWith(';') ? fromCreate : fromCreate + ';';
      });

    if (createBlocks.length === 0) {
      throw new Error('Aucune commande CREATE TABLE trouvée dans le fichier SQL');
    }

    console.log(`📝 ${createBlocks.length} commande(s) CREATE TABLE trouvée(s)\n`);

    // Exécuter les commandes une par une
    for (let i = 0; i < createBlocks.length; i++) {
      const command = createBlocks[i];
      try {
        console.log(`🔄 Exécution de la commande ${i + 1}/${createBlocks.length}...`);
        await sequelize.query(command, { raw: true });
        console.log(`✅ Commande ${i + 1} exécutée avec succès\n`);
      } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('Duplicate')) {
          console.log(`⚠️  La table existe déjà, passage à la suivante...\n`);
        } else {
          console.error('Détail erreur SQL:', error.message);
          throw error;
        }
      }
    }

    // Vérifier avec le nom de schéma explicite (MySQL peut retourner TABLE_NAME en majuscules)
    const [results] = await sequelize.query(
      `SELECT table_name AS table_name
       FROM information_schema.tables
       WHERE table_schema = ?
       AND table_name IN ('tbl_demandes_conges', 'tbl_absences')`,
      { replacements: [DB_NAME], raw: true }
    );

    const row0 = results && results[0] ? results[0] : {};
    const tableNameKey = Object.keys(row0).find(k => k.toLowerCase() === 'table_name') || 'table_name';
    const tables = (results || []).map(r => String((r[tableNameKey] || r.table_name || r.TABLE_NAME || '')).toLowerCase());

    if (!tables.includes('tbl_demandes_conges')) {
      console.error('Tables trouvées dans information_schema:', tables.length ? tables : '(aucune)');
      throw new Error("La table tbl_demandes_conges n'a pas été créée");
    }
    console.log('✅ Table tbl_demandes_conges créée (ou déjà existante).\n');

    if (!tables.includes('tbl_absences')) {
      console.error('Tables trouvées dans information_schema:', tables.length ? tables : '(aucune)');
      throw new Error("La table tbl_absences n'a pas été créée");
    }
    console.log('✅ Table tbl_absences créée (ou déjà existante).\n');

    console.log('\n🎉 Migration des demandes de congés et absences terminée avec succès !');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erreur lors de la migration:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

runDemandesCongesAbsencesMigration();


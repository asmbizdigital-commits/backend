const fs = require('fs');
const path = require('path');
const { sequelize } = require('../server/config/database');
require('dotenv').config();

async function runPlaintesMigration() {
  try {
    console.log('🚀 Démarrage de la migration de la table tbl_plaintes...\n');

    // Vérifier la connexion à la base de données
    await sequelize.authenticate();
    console.log('✅ Connexion à la base de données réussie\n');

    // Lire le fichier SQL
    const sqlFilePath = path.join(__dirname, '../database/create_tbl_plaintes.sql');
    
    if (!fs.existsSync(sqlFilePath)) {
      throw new Error(`Fichier SQL non trouvé: ${sqlFilePath}`);
    }

    const sql = fs.readFileSync(sqlFilePath, 'utf8');
    console.log('📄 Lecture du fichier de migration...');
    console.log('📋 Exécution des commandes SQL...\n');

    // Nettoyer le SQL : supprimer les commentaires et les lignes vides
    let cleanSql = sql
      .split('\n')
      .map(line => {
        // Supprimer les commentaires en ligne
        const commentIndex = line.indexOf('--');
        if (commentIndex !== -1) {
          line = line.substring(0, commentIndex);
        }
        return line.trim();
      })
      .filter(line => line.length > 0)
      .join('\n');

    // Diviser en commandes principales (CREATE TABLE)
    const createTableRegex = /CREATE TABLE[^;]+;/gi;
    const createCommands = cleanSql.match(createTableRegex) || [];

    if (createCommands.length === 0) {
      throw new Error('Aucune commande CREATE TABLE trouvée dans le fichier SQL');
    }

    console.log(`📝 ${createCommands.length} commande(s) SQL trouvée(s)\n`);

    // Exécuter les commandes une par une
    for (let i = 0; i < createCommands.length; i++) {
      const command = createCommands[i].trim();
      
      if (!command) continue;

      try {
        console.log(`🔄 Exécution de la commande ${i + 1}/${createCommands.length}...`);
        await sequelize.query(command, { raw: true });
        console.log(`✅ Commande ${i + 1} exécutée avec succès\n`);
      } catch (error) {
        // Si la table existe déjà, c'est OK
        if (error.message.includes('already exists') || error.message.includes('Duplicate')) {
          console.log(`⚠️  La table existe déjà, passage à la suivante...\n`);
        } else {
          throw error;
        }
      }
    }

    // Vérifier que la table a été créée
    const [results] = await sequelize.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() 
      AND table_name = 'tbl_plaintes'
    `);

    if (results[0].count > 0) {
      console.log('✅ Table tbl_plaintes créée avec succès !\n');
      
      // Afficher la structure de la table
      const [columns] = await sequelize.query(`
        DESCRIBE tbl_plaintes
      `);
      
      console.log('📊 Structure de la table:');
      console.log('─'.repeat(80));
      columns.forEach(col => {
        console.log(`  ${col.Field.padEnd(30)} ${col.Type.padEnd(30)} ${col.Null} ${col.Key}`);
      });
      console.log('─'.repeat(80));
    } else {
      throw new Error('La table tbl_plaintes n\'a pas été créée');
    }

    console.log('\n🎉 Migration terminée avec succès !');
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

runPlaintesMigration();


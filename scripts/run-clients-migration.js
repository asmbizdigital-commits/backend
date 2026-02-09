/**
 * Exécute les migrations SQL du module Clients :
 * 1. Création de tbl_clients
 * 2. Ajout de client_id à tbl_fin_factures, tbl_plaintes, tbl_taches, tbl_task_pro
 * Exécuter depuis la racine du projet : node backend/scripts/run-clients-migration.js
 * Ou depuis backend : node scripts/run-clients-migration.js
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { sequelize } = require('../server/config/database');
const { QueryTypes } = require('sequelize');

const DB_NAME = process.env.DB_NAME || process.env.MYSQL_DATABASE || 'hotel_beatrice';
const migrationsDir = path.join(__dirname, '../../database');

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Connexion DB OK.\n');

    const createClients = fs.readFileSync(path.join(migrationsDir, 'migration_create_tbl_clients.sql'), 'utf8');
    await sequelize.query(createClients);
    console.log('✓ tbl_clients créée ou déjà existante.');

    const addAssujettiPath = path.join(migrationsDir, 'migration_add_assujetti_to_tbl_clients.sql');
    if (fs.existsSync(addAssujettiPath)) {
      try {
        const addAssujetti = fs.readFileSync(addAssujettiPath, 'utf8');
        const st = addAssujetti.replace(/--.*$/gm, '').trim().replace(/\n+/g, ' ');
        if (st) await sequelize.query(st);
        console.log('✓ Colonne assujetti ajoutée à tbl_clients (ou déjà présente).');
      } catch (e) {
        if (e.message && (e.message.includes('Duplicate column') || e.message.includes('already exists'))) {
          console.log('✓ Colonne assujetti déjà présente, ignoré.');
        } else throw e;
      }
    }

    const addClientIdPath = path.join(migrationsDir, 'migration_add_client_id_to_factures_plaintes_taches.sql');
    if (fs.existsSync(addClientIdPath)) {
      const addClientId = fs.readFileSync(addClientIdPath, 'utf8');
      // Supprimer les lignes de commentaires puis découper par ';'
      const withoutComments = addClientId.replace(/^\s*--[^\n]*\n?/gm, '').trim();
      const statements = withoutComments.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
      for (const st of statements) {
        try {
          await sequelize.query(st + ';');
          console.log('✓', st.slice(0, 70).replace(/\s+/g, ' ') + '…');
        } catch (e) {
          if (e.message && (e.message.includes('Duplicate column') || e.message.includes('already exists'))) {
            console.log('  (colonne ou contrainte déjà présente, ignoré)');
          } else throw e;
        }
      }
    }
    console.log('\nMigrations clients terminées.');
    process.exit(0);
  } catch (err) {
    console.error('Erreur:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();

/**
 * Migre les tables / vues ASM Pro Client (extrait asmproclient.sql).
 * Variables : backend/.env (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD).
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const sqlPath = path.join(__dirname, '../database/migrate_asmproclient.sql');

async function main() {
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(String(process.env.DB_PORT || 3306), 10);
  const database = process.env.DB_NAME || 'asmdb';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';

  console.log('Migration ASM Pro Client → SQL dans', sqlPath);
  console.log(`Connexion ${user}@${host}:${port}/${database}\n`);

  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    multipleStatements: true
  });

  try {
    await conn.query(sql);
    console.log('✅ Migration exécutée avec succès.');
    console.log(
      '\nTables : articles_attributes, articles_facture, connaissements, conteneurs, documents_douaniers, factures_commerciales, infos_bancaires'
    );
    console.log('Vues : vue_connaissement_complet, vue_facture_detaillee');
  } catch (e) {
    console.error('❌ Erreur SQL:', e.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();

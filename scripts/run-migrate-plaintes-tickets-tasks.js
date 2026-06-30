/**
 * Crée la table tbl_plaintes_tickets_tasks.
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function main() {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(String(process.env.DB_PORT || 3306), 10);
  const database = process.env.DB_NAME || 'asmdb';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';

  const sqlPath = path.join(__dirname, '../database/create_tbl_plaintes_tickets_tasks.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Migration : tbl_plaintes_tickets_tasks');
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
    console.log('✅ Table tbl_plaintes_tickets_tasks créée ou déjà présente.');
  } catch (e) {
    console.error('❌ Erreur SQL:', e.message);
    if (e.sqlMessage) console.error('   ', e.sqlMessage);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();

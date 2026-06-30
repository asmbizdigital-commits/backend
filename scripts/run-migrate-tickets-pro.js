/**
 * Crée la table tbl_tickets_pro.
 * Variables : backend/.env (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD).
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

  const sqlPath = path.join(__dirname, '../database/create_tbl_tickets_pro.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Migration tickets pro : création tbl_tickets_pro');
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
    console.log('✅ Table tbl_tickets_pro créée ou déjà présente.');
  } catch (e) {
    console.error('❌ Erreur SQL:', e.message);
    if (e.sqlMessage) console.error('   ', e.sqlMessage);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();

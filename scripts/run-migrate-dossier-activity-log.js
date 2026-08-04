/**
 * Crée tbl_dossier_activity_log (monitoring phase test).
 * Usage: node backend/scripts/run-migrate-dossier-activity-log.js
 */
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function main() {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(String(process.env.DB_PORT || 3306), 10);
  const database = process.env.DB_NAME || 'asmdb';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';

  const sqlPath = path.join(__dirname, '../database/create_tbl_dossier_activity_log.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log(`Migration tbl_dossier_activity_log → ${user}@${host}:${port}/${database}`);

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
    console.log('✅ Table tbl_dossier_activity_log prête.');
  } catch (e) {
    console.error('❌', e.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();

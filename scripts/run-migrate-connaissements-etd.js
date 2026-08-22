/**
 * Ajoute la colonne `etd` sur connaissements.
 * Usage: node backend/scripts/run-migrate-connaissements-etd.js
 */
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

  console.log(`Migration connaissements.etd → ${user}@${host}:${port}/${database}`);

  const conn = await mysql.createConnection({ host, port, user, password, database });
  try {
    const [rows] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'connaissements' AND COLUMN_NAME = 'etd'`,
      [database]
    );

    if (rows.length > 0) {
      console.log('ℹ️  Colonne connaissements.etd déjà présente — rien à faire.');
      return;
    }

    await conn.query(
      'ALTER TABLE `connaissements` ADD COLUMN `etd` datetime DEFAULT NULL AFTER `eta`'
    );
    console.log('✅ Colonne connaissements.etd ajoutée.');
  } catch (e) {
    console.error('❌', e.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();

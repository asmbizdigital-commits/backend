/**
 * Ajoute la colonne observateurs sur tbl_tickets_pro.
 */
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function main() {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(String(process.env.DB_PORT || 3306), 10);
  const database = process.env.DB_NAME || 'asmdb';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';

  console.log('Migration tickets pro : colonne observateurs');
  console.log(`Connexion ${user}@${host}:${port}/${database}\n`);

  const conn = await mysql.createConnection({ host, port, user, password, database });

  try {
    if (await columnExists(conn, 'tbl_tickets_pro', 'observateurs')) {
      console.log('  ⏭  Colonne observateurs déjà présente');
      return;
    }
    await conn.query(
      "ALTER TABLE `tbl_tickets_pro` ADD COLUMN `observateurs` TEXT NULL COMMENT 'IDs des observateurs (JSON)' AFTER `assignee_id`"
    );
    console.log('  ✅ Colonne observateurs ajoutée');
  } catch (e) {
    console.error('❌ Erreur SQL:', e.message);
    if (e.sqlMessage) console.error('   ', e.sqlMessage);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();

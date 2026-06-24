/**
 * Ajoute zone, direction_provinciale_id, bureau_international_id sur tbl_utilisateurs.
 * Variables : backend/.env (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD).
 */
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const COLUMNS = [
  {
    name: 'zone',
    ddl: "ADD COLUMN `zone` VARCHAR(30) NULL DEFAULT NULL AFTER `sous_departement_id`"
  },
  {
    name: 'direction_provinciale_id',
    ddl: "ADD COLUMN `direction_provinciale_id` INT NULL DEFAULT NULL AFTER `zone`"
  },
  {
    name: 'bureau_international_id',
    ddl: "ADD COLUMN `bureau_international_id` INT NULL DEFAULT NULL AFTER `direction_provinciale_id`"
  }
];

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

  console.log('Migration tbl_utilisateurs : zone + directions/bureaux');
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
    for (const col of COLUMNS) {
      const exists = await columnExists(conn, 'tbl_utilisateurs', col.name);
      if (exists) {
        console.log(`  ⏭  Colonne ${col.name} déjà présente`);
        continue;
      }
      await conn.query(`ALTER TABLE \`tbl_utilisateurs\` ${col.ddl}`);
      console.log(`  ✅ Colonne ${col.name} ajoutée`);
    }

    const idxDir = 'idx_utilisateurs_direction_provinciale';
    const [idxDirRows] = await conn.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_utilisateurs' AND INDEX_NAME = ? LIMIT 1`,
      [idxDir]
    );
    if (idxDirRows.length === 0) {
      await conn.query(
        `ALTER TABLE \`tbl_utilisateurs\` ADD KEY \`${idxDir}\` (\`direction_provinciale_id\`)`
      );
      console.log(`  ✅ Index ${idxDir} ajouté`);
    }

    const idxBur = 'idx_utilisateurs_bureau_international';
    const [idxBurRows] = await conn.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_utilisateurs' AND INDEX_NAME = ? LIMIT 1`,
      [idxBur]
    );
    if (idxBurRows.length === 0) {
      await conn.query(
        `ALTER TABLE \`tbl_utilisateurs\` ADD KEY \`${idxBur}\` (\`bureau_international_id\`)`
      );
      console.log(`  ✅ Index ${idxBur} ajouté`);
    }

    console.log('\n✅ Migration terminée.');
  } catch (e) {
    console.error('❌ Erreur SQL:', e.message);
    if (e.sqlMessage) console.error('   ', e.sqlMessage);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();

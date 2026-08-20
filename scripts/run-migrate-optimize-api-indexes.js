/**
 * Crée les index API manquants (idempotent).
 * Usage: npm run migrate:optimize-api-indexes
 */
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const INDEXES = [
  {
    name: 'idx_connaissements_created',
    table: 'connaissements',
    sql: 'CREATE INDEX `idx_connaissements_created` ON `connaissements` (`created_at`)'
  },
  {
    name: 'idx_dossier_activity_conn_created',
    table: 'tbl_dossier_activity_log',
    sql: 'CREATE INDEX `idx_dossier_activity_conn_created` ON `tbl_dossier_activity_log` (`connaissement_id`, `created_at`)'
  },
  {
    name: 'idx_docs_feri_conn',
    table: 'tbl_docs_feri',
    sql: 'CREATE INDEX `idx_docs_feri_conn` ON `tbl_docs_feri` (`doc_connaissement_id`)'
  },
  {
    name: 'idx_assign_bl_ctrl_conn_statut',
    table: 'tbl_assignation_bl_controleur',
    sql: 'CREATE INDEX `idx_assign_bl_ctrl_conn_statut` ON `tbl_assignation_bl_controleur` (`connaissement_id`, `statut`)'
  }
];

async function tableExists(conn, database, table) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1`,
    [database, table]
  );
  return rows.length > 0;
}

async function indexExists(conn, database, table, indexName) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [database, table, indexName]
  );
  return rows.length > 0;
}

async function columnCoveredByIndex(conn, database, table, column) {
  const [rows] = await conn.query(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? AND SEQ_IN_INDEX = 1`,
    [database, table, column]
  );
  return rows.map((r) => r.INDEX_NAME);
}

async function main() {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(String(process.env.DB_PORT || 3306), 10);
  const database = process.env.DB_NAME || 'asmdb';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';

  console.log(`Migration index API → ${user}@${host}:${port}/${database}`);

  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database
  });

  let created = 0;
  let skipped = 0;
  let failed = 0;

  try {
    for (const idx of INDEXES) {
      const existsTable = await tableExists(conn, database, idx.table);
      if (!existsTable) {
        console.log(`⏭  Table absente, ignoré : ${idx.table}.${idx.name}`);
        skipped += 1;
        continue;
      }

      if (await indexExists(conn, database, idx.table, idx.name)) {
        console.log(`✓  Déjà présent : ${idx.table}.${idx.name}`);
        skipped += 1;
        continue;
      }

      try {
        await conn.query(idx.sql);
        console.log(`✅ Créé : ${idx.table}.${idx.name}`);
        created += 1;
      } catch (e) {
        if (e.code === 'ER_DUP_KEYNAME' || e.errno === 1061) {
          console.log(`✓  Déjà présent (1061) : ${idx.table}.${idx.name}`);
          skipped += 1;
        } else {
          console.error(`❌ ${idx.table}.${idx.name} : ${e.message}`);
          failed += 1;
        }
      }
    }

    const covering = await columnCoveredByIndex(conn, database, 'connaissements', 'created_at');
    console.log(`\nIndex sur connaissements.created_at : ${covering.length ? covering.join(', ') : '(aucun)'}`);
    console.log(`Résumé : ${created} créé(s), ${skipped} ignoré(s), ${failed} échec(s)`);
    if (failed) process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});

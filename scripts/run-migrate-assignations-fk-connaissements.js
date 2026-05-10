/**
 * Référence tbl_assignations_bl et tbl_assignation_bl_controleur sur connaissements(id).
 * Idempotent : peut être relancé après une première migration partielle ou un autre nom de FK.
 *
 * DESTRUCTIF : vide les deux tables d’assignation.
 * .env : DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 */
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function currentSchema(conn, fallback) {
  const [[row]] = await conn.query('SELECT DATABASE() AS db');
  return row?.db || fallback;
}

async function listForeignKeys(conn, schema, table) {
  const [rows] = await conn.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [schema, table]
  );
  return rows.map((r) => r.CONSTRAINT_NAME);
}

async function dropAllForeignKeys(conn, schema, table) {
  const names = await listForeignKeys(conn, schema, table);
  for (const name of names) {
    await conn.query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${name}\``);
    console.log(`  Suppression FK \`${name}\` sur ${table}`);
  }
}

async function columnSet(conn, schema, table) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [schema, table]
  );
  return new Set(rows.map((r) => r.COLUMN_NAME));
}

async function indexExists(conn, schema, table, indexName) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [schema, table, indexName]
  );
  return rows.length > 0;
}

async function dropIndexIfExists(conn, schema, table, indexName) {
  if (await indexExists(conn, schema, table, indexName)) {
    await conn.query(`ALTER TABLE \`${table}\` DROP INDEX \`${indexName}\``);
    console.log(`  Suppression index \`${indexName}\` sur ${table}`);
  }
}

async function constraintExists(conn, schema, table, constraintName) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`,
    [schema, table, constraintName]
  );
  return rows.length > 0;
}

async function tableExists(conn, schema, table) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1`,
    [schema, table]
  );
  return rows.length > 0;
}

/**
 * Migre une table assignation : UUID bl_document_id -> INT connaissement_id + FK connaissements.
 */
async function migrateAssignTable(conn, schema, table, options) {
  const {
    oldIndex,
    newIndex,
    fkName
  } = options;

  if (!(await tableExists(conn, schema, table))) {
    console.log(`  Table ${table} absente — ignoré.`);
    return;
  }

  await dropAllForeignKeys(conn, schema, table);
  await dropIndexIfExists(conn, schema, table, oldIndex);
  await dropIndexIfExists(conn, schema, table, newIndex);

  const cols = await columnSet(conn, schema, table);

  if (cols.has('bl_document_id')) {
    await conn.query(
      `ALTER TABLE \`${table}\` CHANGE COLUMN \`bl_document_id\` \`connaissement_id\` int NOT NULL`
    );
    console.log(`  Colonne renommée bl_document_id -> connaissement_id sur ${table}`);
  } else if (!cols.has('connaissement_id')) {
    console.log(`  Avertissement : ni bl_document_id ni connaissement_id sur ${table}`);
    return;
  }

  await conn.query(
    `ALTER TABLE \`${table}\` ADD KEY \`${newIndex}\` (\`connaissement_id\`)`
  );
  console.log(`  Index ${newIndex} créé ou recréé sur ${table}`);

  if (!(await constraintExists(conn, schema, table, fkName))) {
    await conn.query(
      `ALTER TABLE \`${table}\`
       ADD CONSTRAINT \`${fkName}\`
       FOREIGN KEY (\`connaissement_id\`) REFERENCES \`connaissements\` (\`id\`)
       ON DELETE CASCADE ON UPDATE CASCADE`
    );
    console.log(`  FK ${fkName} ajoutée sur ${table}`);
  } else {
    console.log(`  FK ${fkName} déjà présente — inchangée.`);
  }
}

async function main() {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(String(process.env.DB_PORT || 3306), 10);
  const envDb = process.env.DB_NAME || 'asmdb';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';

  console.log(`Connexion ${user}@${host}:${port}/${envDb}\n`);

  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database: envDb,
    multipleStatements: true
  });

  try {
    const schema = await currentSchema(conn, envDb);
    console.log('Schéma :', schema);

    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    if (await tableExists(conn, schema, 'tbl_assignation_bl_controleur')) {
      await conn.query('DELETE FROM `tbl_assignation_bl_controleur`');
    }
    if (await tableExists(conn, schema, 'tbl_assignations_bl')) {
      await conn.query('DELETE FROM `tbl_assignations_bl`');
    }
    console.log('Tables d’assignation vidées.\n');

    await migrateAssignTable(conn, schema, 'tbl_assignations_bl', {
      oldIndex: 'idx_assignations_bl_bl_document_id',
      newIndex: 'idx_assignations_bl_connaissement_id',
      fkName: 'fk_assignations_bl_connaissement'
    });

    console.log('');

    await migrateAssignTable(conn, schema, 'tbl_assignation_bl_controleur', {
      oldIndex: 'idx_assign_bl_ctrl_bl_document_id',
      newIndex: 'idx_assign_bl_ctrl_connaissement_id',
      fkName: 'fk_assign_bl_ctrl_connaissement'
    });

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('\n✅ Migration assignations → connaissements terminée (idempotent).');
  } catch (e) {
    console.error('❌ Erreur :', e.message);
    if (e.sqlMessage) console.error('   ', e.sqlMessage);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();

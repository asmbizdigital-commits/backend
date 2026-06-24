/**
 * Remplace chambre_id sur tbl_plaintes par zone / direction_provinciale_id / bureau_international_id.
 * Variables : backend/.env (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD).
 */
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [table]
  );
  return rows.length > 0;
}

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function constraintExists(conn, table, name) {
  const [rows] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`,
    [table, name]
  );
  return rows.length > 0;
}

async function main() {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(String(process.env.DB_PORT || 3306), 10);
  const database = process.env.DB_NAME || 'asmdb';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';

  console.log('Migration plaintes : zone + direction + bureau (suppression chambre_id)');
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
    if (!(await tableExists(conn, 'tbl_plaintes'))) {
      console.log('  ⏭  Table tbl_plaintes absente — exécutez create_tbl_plaintes.sql après mise à jour du fichier');
      return;
    }

    if (await constraintExists(conn, 'tbl_plaintes', 'fk_plaintes_chambre')) {
      await conn.query('ALTER TABLE `tbl_plaintes` DROP FOREIGN KEY `fk_plaintes_chambre`');
      console.log('  ✅ Contrainte fk_plaintes_chambre supprimée');
    }

    if (await columnExists(conn, 'tbl_plaintes', 'chambre_id')) {
      try {
        await conn.query('ALTER TABLE `tbl_plaintes` DROP INDEX `idx_chambre_id`');
      } catch (e) {
        console.warn('  ⚠  idx_chambre_id :', e.message);
      }
      await conn.query('ALTER TABLE `tbl_plaintes` DROP COLUMN `chambre_id`');
      console.log('  ✅ Colonne chambre_id supprimée');
    } else {
      console.log('  ⏭  Colonne chambre_id déjà absente');
    }

    if (!(await columnExists(conn, 'tbl_plaintes', 'zone'))) {
      await conn.query(
        "ALTER TABLE `tbl_plaintes` ADD COLUMN `zone` varchar(30) NULL DEFAULT NULL COMMENT 'Code zone géographique' AFTER `sous_departement_id`"
      );
      console.log('  ✅ Colonne zone ajoutée');
    } else {
      console.log('  ⏭  Colonne zone déjà présente');
    }

    if (!(await columnExists(conn, 'tbl_plaintes', 'direction_provinciale_id'))) {
      await conn.query(
        'ALTER TABLE `tbl_plaintes` ADD COLUMN `direction_provinciale_id` int NULL DEFAULT NULL AFTER `zone`'
      );
      console.log('  ✅ Colonne direction_provinciale_id ajoutée');
    }

    if (!(await columnExists(conn, 'tbl_plaintes', 'bureau_international_id'))) {
      await conn.query(
        'ALTER TABLE `tbl_plaintes` ADD COLUMN `bureau_international_id` int NULL DEFAULT NULL AFTER `direction_provinciale_id`'
      );
      console.log('  ✅ Colonne bureau_international_id ajoutée');
    }

    const fks = [
      {
        name: 'fk_plaintes_direction',
        ddl:
          'ADD CONSTRAINT `fk_plaintes_direction` FOREIGN KEY (`direction_provinciale_id`) REFERENCES `tbl_directions_provinciales` (`id`) ON DELETE SET NULL ON UPDATE CASCADE'
      },
      {
        name: 'fk_plaintes_bureau',
        ddl:
          'ADD CONSTRAINT `fk_plaintes_bureau` FOREIGN KEY (`bureau_international_id`) REFERENCES `tbl_bureaux_internationaux` (`id`) ON DELETE SET NULL ON UPDATE CASCADE'
      }
    ];

    for (const fk of fks) {
      if (await constraintExists(conn, 'tbl_plaintes', fk.name)) {
        console.log(`  ⏭  Contrainte ${fk.name} déjà présente`);
        continue;
      }
      try {
        await conn.query(`ALTER TABLE \`tbl_plaintes\` ${fk.ddl}`);
        console.log(`  ✅ Contrainte ${fk.name} ajoutée`);
      } catch (e) {
        console.warn(`  ⚠  Contrainte ${fk.name} : ${e.message}`);
      }
    }

    console.log('\n✅ Migration plaintes géographiques terminée.');
  } catch (e) {
    console.error('❌ Erreur SQL:', e.message);
    if (e.sqlMessage) console.error('   ', e.sqlMessage);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();

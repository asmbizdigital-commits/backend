/**
 * Crée `zones`, rattache zone_connaissement / direction_connaissement / bureau_connaissement sur connaissements.
 * Variables : backend/.env (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD).
 */
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const ZONE_SEED = [
  ['europe', 'Zone Europe'],
  ['asie', 'Zone Asie'],
  ['afrique', 'Zone Afrique'],
  ['moyenOrient', 'Zone Moyen-Orient']
];

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

async function main() {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(String(process.env.DB_PORT || 3306), 10);
  const database = process.env.DB_NAME || 'asmdb';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';

  console.log('Migration connaissements : zones + rattachements géographiques');
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
    if (!(await tableExists(conn, 'zones'))) {
      await conn.query(`
        CREATE TABLE \`zones\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`code\` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
          \`nom\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
          \`statut\` enum('Actif','Inactif') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Actif',
          \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uk_zones_code\` (\`code\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('  ✅ Table zones créée');
    } else {
      console.log('  ⏭  Table zones déjà présente');
    }

    for (const [code, nom] of ZONE_SEED) {
      await conn.query(
        `INSERT IGNORE INTO zones (code, nom, statut) VALUES (?, ?, 'Actif')`,
        [code, nom]
      );
    }
    console.log('  ✅ Zones de référence insérées');

    const cols = [
      { name: 'zone_connaissement', ddl: 'ADD COLUMN `zone_connaissement` int NULL DEFAULT NULL AFTER `zone_nom`' },
      {
        name: 'direction_connaissement',
        ddl: 'ADD COLUMN `direction_connaissement` int NULL DEFAULT NULL AFTER `zone_connaissement`'
      },
      {
        name: 'bureau_connaissement',
        ddl: 'ADD COLUMN `bureau_connaissement` int NULL DEFAULT NULL AFTER `direction_connaissement`'
      }
    ];

    for (const col of cols) {
      if (await columnExists(conn, 'connaissements', col.name)) {
        console.log(`  ⏭  Colonne connaissements.${col.name} déjà présente`);
        continue;
      }
      await conn.query(`ALTER TABLE \`connaissements\` ${col.ddl}`);
      console.log(`  ✅ Colonne connaissements.${col.name} ajoutée`);
    }

    const fks = [
      {
        name: 'fk_connaissements_zone',
        ddl:
          'ADD CONSTRAINT `fk_connaissements_zone` FOREIGN KEY (`zone_connaissement`) REFERENCES `zones` (`id`) ON DELETE SET NULL ON UPDATE CASCADE'
      },
      {
        name: 'fk_connaissements_direction',
        ddl:
          'ADD CONSTRAINT `fk_connaissements_direction` FOREIGN KEY (`direction_connaissement`) REFERENCES `tbl_directions_provinciales` (`id`) ON DELETE SET NULL ON UPDATE CASCADE'
      },
      {
        name: 'fk_connaissements_bureau',
        ddl:
          'ADD CONSTRAINT `fk_connaissements_bureau` FOREIGN KEY (`bureau_connaissement`) REFERENCES `tbl_bureaux_internationaux` (`id`) ON DELETE SET NULL ON UPDATE CASCADE'
      }
    ];

    for (const fk of fks) {
      const [rows] = await conn.query(
        `SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'connaissements' AND CONSTRAINT_NAME = ? LIMIT 1`,
        [fk.name]
      );
      if (rows.length > 0) {
        console.log(`  ⏭  Contrainte ${fk.name} déjà présente`);
        continue;
      }
      try {
        await conn.query(`ALTER TABLE \`connaissements\` ${fk.ddl}`);
        console.log(`  ✅ Contrainte ${fk.name} ajoutée`);
      } catch (e) {
        console.warn(`  ⚠  Contrainte ${fk.name} non ajoutée : ${e.message}`);
      }
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

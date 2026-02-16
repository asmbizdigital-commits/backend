#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env.production') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { sequelize } = require('../server/config/database');

const columns = [
  { name: 'piece_justificative_1_url', def: 'VARCHAR(512) NULL' },
  { name: 'piece_justificative_1_nom', def: 'VARCHAR(255) NULL' },
  { name: 'piece_justificative_2_url', def: 'VARCHAR(512) NULL' },
  { name: 'piece_justificative_2_nom', def: 'VARCHAR(255) NULL' },
  { name: 'piece_justificative_3_url', def: 'VARCHAR(512) NULL' },
  { name: 'piece_justificative_3_nom', def: 'VARCHAR(255) NULL' }
];

async function run() {
  try {
    await sequelize.authenticate();
    const dialect = sequelize.getDialect();

    for (const col of columns) {
      try {
        const q = dialect === 'postgres' || dialect === 'postgresql'
          ? `ALTER TABLE tbl_soumissions_besoins ADD COLUMN "${col.name}" VARCHAR(512)`
          : `ALTER TABLE tbl_soumissions_besoins ADD COLUMN \`${col.name}\` ${col.def}`;
        await sequelize.query(q, { raw: true });
        console.log('✅', col.name);
      } catch (err) {
        if (err.message && (err.message.includes('Duplicate column') || err.message.includes('already exists'))) {
          console.log('⏭️', col.name, '(déjà existant)');
        } else throw err;
      }
    }
    console.log('\n🎉 Colonnes pièces justificatives prêtes.');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();

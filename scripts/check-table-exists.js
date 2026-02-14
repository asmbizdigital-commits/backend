#!/usr/bin/env node
/**
 * Vérifie si une table existe dans la base de données.
 * Usage pour PRODUCTION :
 *   DB_HOST=xxx DB_PORT=xxx DB_USER=xxx DB_PASSWORD=xxx DB_NAME=xxx node scripts/check-table-exists.js tbl_circuits_depenses
 *
 * Ou copier les vars de production dans .env.production et :
 *   node -r dotenv/config scripts/check-table-exists.js tbl_circuits_depenses dotenv_config_path=.env.production
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const tableName = process.argv[2] || 'tbl_circuits_depenses';

async function check() {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'asmdb'
  };
  try {
    const conn = await mysql.createConnection(config);
    const [rows] = await conn.query(
      'SELECT COUNT(*) as c FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
      [config.database, tableName]
    );
    const exists = rows[0].c > 0;
    console.log(`Base: ${config.database} @ ${config.host}`);
    console.log(`Table "${tableName}" existe:`, exists ? 'OUI' : 'NON');
    await conn.end();
    process.exit(exists ? 0 : 1);
  } catch (err) {
    console.error('Erreur connexion:', err.message);
    process.exit(2);
  }
}

check();

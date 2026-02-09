#!/usr/bin/env node
/**
 * Supprime les contraintes de definer (utilisateur) sur vues, triggers, procédures, événements.
 * Toute clause DEFINER=`user`@`host` est retirée : MySQL utilisera l'utilisateur courant.
 * Usage: node scripts/fix-definer.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

// Supprimer toute clause DEFINER pour ne plus dépendre d'un utilisateur spécifique
const DEFINER_REGEX = /DEFINER=`[^`]+`@`[^`]+`\s*/gi;
const REMOVE_DEFINER = () => '';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'asmdb',
  multipleStatements: true
};

async function run() {
  let conn;
  try {
    console.log('Connexion à la base...');
    conn = await mysql.createConnection(dbConfig);
    const db = dbConfig.database;

    console.log('Suppression des contraintes DEFINER (utilisateur courant utilisé).\n');

    // ---- VUES ----
    const [views] = await conn.query(
      `SELECT TABLE_SCHEMA, TABLE_NAME FROM information_schema.VIEWS 
       WHERE TABLE_SCHEMA = ? AND DEFINER LIKE '%uvztg2ft6in5iomc%'`,
      [db]
    );
    for (const v of views) {
      const fullName = `\`${v.TABLE_SCHEMA}\`.\`${v.TABLE_NAME}\``;
      const [rows] = await conn.query(`SHOW CREATE VIEW ${fullName}`);
      const createSql = rows[0]['Create View'];
      let newSql = createSql.replace(DEFINER_REGEX, REMOVE_DEFINER);
      // CREATE OR REPLACE évite "Table already exists" si le DROP échoue (dépendances)
      newSql = newSql.replace(/^\s*CREATE\s+VIEW\s+/i, 'CREATE OR REPLACE VIEW ');
      await conn.query(`DROP VIEW IF EXISTS ${fullName}`);
      await conn.query(newSql);
      console.log('  Vue:', v.TABLE_NAME);
    }
    if (views.length) console.log(`  -> ${views.length} vue(s) mise(s) à jour.\n`);

    // ---- TRIGGERS ----
    const [triggers] = await conn.query(
      `SELECT TRIGGER_SCHEMA, TRIGGER_NAME, EVENT_OBJECT_TABLE FROM information_schema.TRIGGERS 
       WHERE TRIGGER_SCHEMA = ? AND DEFINER LIKE '%uvztg2ft6in5iomc%'`,
      [db]
    );
    for (const t of triggers) {
      const fullName = `\`${t.TRIGGER_SCHEMA}\`.\`${t.TRIGGER_NAME}\``;
      const [rows] = await conn.query(`SHOW CREATE TRIGGER ${fullName}`);
      const createSql = rows[0]['SQL Original Statement'];
      const newSql = createSql.replace(DEFINER_REGEX, REMOVE_DEFINER);
      await conn.query(`DROP TRIGGER IF EXISTS ${fullName}`);
      await conn.query(newSql);
      console.log('  Trigger:', t.TRIGGER_NAME);
    }
    if (triggers.length) console.log(`  -> ${triggers.length} trigger(s) mis à jour.\n`);

    // ---- PROCEDURES ----
    const [procs] = await conn.query(
      `SELECT ROUTINE_SCHEMA, ROUTINE_NAME, ROUTINE_TYPE FROM information_schema.ROUTINES 
       WHERE ROUTINE_SCHEMA = ? AND DEFINER LIKE '%uvztg2ft6in5iomc%'`,
      [db]
    );
    for (const r of procs) {
      const fullName = `\`${r.ROUTINE_SCHEMA}\`.\`${r.ROUTINE_NAME}\``;
      const showCmd = r.ROUTINE_TYPE === 'PROCEDURE' ? 'SHOW CREATE PROCEDURE' : 'SHOW CREATE FUNCTION';
      const [rows] = await conn.query(`${showCmd} ${fullName}`);
      const key = r.ROUTINE_TYPE === 'PROCEDURE' ? 'Create Procedure' : 'Create Function';
      const createSql = rows[0][key];
      const newSql = createSql.replace(DEFINER_REGEX, REMOVE_DEFINER);
      await conn.query(`DROP ${r.ROUTINE_TYPE} IF EXISTS ${fullName}`);
      await conn.query(newSql);
      console.log(`  ${r.ROUTINE_TYPE}:`, r.ROUTINE_NAME);
    }
    if (procs.length) console.log(`  -> ${procs.length} routine(s) mise(s) à jour.\n`);

    // ---- EVENTS ----
    const [events] = await conn.query(
      `SELECT EVENT_SCHEMA, EVENT_NAME FROM information_schema.EVENTS 
       WHERE EVENT_SCHEMA = ? AND DEFINER LIKE '%uvztg2ft6in5iomc%'`,
      [db]
    );
    for (const e of events) {
      const fullName = `\`${e.EVENT_SCHEMA}\`.\`${e.EVENT_NAME}\``;
      const [rows] = await conn.query(`SHOW CREATE EVENT ${fullName}`);
      const createSql = rows[0]['Create Event'];
      const newSql = createSql.replace(DEFINER_REGEX, REMOVE_DEFINER);
      await conn.query(`DROP EVENT IF EXISTS ${fullName}`);
      await conn.query(newSql);
      console.log('  Event:', e.EVENT_NAME);
    }
    if (events.length) console.log(`  -> ${events.length} événement(s) mis à jour.\n`);

    const total = views.length + triggers.length + procs.length + events.length;
    if (total === 0) {
      console.log('Aucun objet avec le definer uvztg2ft6in5iomc trouvé.');
    } else {
      console.log('Terminé. Contraintes definer supprimées pour', total, 'objet(s).');
    }
  } catch (err) {
    console.error('Erreur:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

run();

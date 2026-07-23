/**
 * Ajoute les valeurs ENUM « Responsable Zone » et « Chef Exécutif des Opérations »
 * sur tbl_utilisateurs.role.
 * Fusionne les rôles présents en base et déduplique selon utf8mb4_unicode_ci.
 *
 * Variables : backend/.env (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD).
 *
 * Usage : node backend/scripts/run-migrate-user-role-responsable-zone-chef-executif.js
 */
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const NEW_ROLES = ['Responsable Zone', 'Chef Exécutif des Opérations'];

/** Aligné sur backend/server/models/User.js */
const CANONICAL_ROLES = [
  'Agent',
  'Agent Chambre',
  'Agent Exterieur',
  'Agent Gouvernant',
  'Administrateur',
  'Auditeur',
  'Booker',
  'call_center',
  'Chef Exécutif des Opérations',
  'Controlleur Sygram',
  'Directeur Opérations',
  'Directeur Operations',
  'Gestionnaire des Plaintes',
  'Guichetier',
  'Manager Bureau',
  'Patron',
  'Responsable Zone',
  'Saisisseur',
  'Superviseur',
  'Superviseur Buanderie',
  'Superviseur Comptable',
  'Superviseur Finance',
  'Superviseur Housing',
  'Superviseur RH',
  'Superviseur Resto',
  'Superviseur Stock',
  'Superviseur Technique',
  'Verificateur Sygrem',
  'Web Master'
];

function escapeEnumValue(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/'/g, "''");
}

function accentFoldKey(s) {
  return String(s)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function toNfc(s) {
  return String(s).trim().normalize('NFC');
}

function pickCanonicalLabel(key) {
  for (const c of CANONICAL_ROLES) {
    if (accentFoldKey(c) === key) return c;
  }
  return null;
}

async function main() {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(String(process.env.DB_PORT || 3306), 10);
  const database = process.env.DB_NAME || 'asmdb';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';

  console.log(`Migration rôles ${NEW_ROLES.join(' + ')} (ENUM tbl_utilisateurs.role)`);
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
    const [rows] = await conn.query(
      `SELECT DISTINCT role AS r FROM tbl_utilisateurs WHERE role IS NOT NULL AND TRIM(role) <> ''`
    );
    const fromDb = rows
      .map((row) => (typeof row.r === 'string' || typeof row.r === 'number' ? String(row.r) : ''))
      .filter(Boolean);

    const allLabels = new Set([...CANONICAL_ROLES.map(toNfc), ...fromDb.map(toNfc)]);
    const groups = new Map();
    for (const raw of allLabels) {
      const k = accentFoldKey(raw);
      if (!groups.has(k)) groups.set(k, new Set());
      groups.get(k).add(raw);
    }

    for (const [key, set] of groups) {
      const variants = [...set];
      if (variants.length <= 1) continue;
      const preferred = pickCanonicalLabel(key);
      const winner = preferred || variants.slice().sort((a, b) => a.localeCompare(b, 'fr'))[0];
      for (const v of variants) {
        if (v === winner) continue;
        await conn.query('UPDATE tbl_utilisateurs SET role = ? WHERE role = ?', [winner, v]);
      }
    }

    const [rowsAfter] = await conn.query(
      `SELECT DISTINCT role AS r FROM tbl_utilisateurs WHERE role IS NOT NULL AND TRIM(role) <> ''`
    );
    const distinctInTable = rowsAfter.map((row) => toNfc(row.r)).filter(Boolean);

    const mergedLabels = [...CANONICAL_ROLES.map(toNfc), ...distinctInTable];
    const enumByFold = new Map();
    for (const label of mergedLabels) {
      const k = accentFoldKey(label);
      enumByFold.set(k, pickCanonicalLabel(k) || label);
    }
    const sortedEnum = [...enumByFold.values()].sort((a, b) =>
      a.localeCompare(b, 'fr', { sensitivity: 'variant' })
    );

    const enumBody = sortedEnum.map((v) => `  '${escapeEnumValue(v)}'`).join(',\n');
    const sql = `ALTER TABLE \`tbl_utilisateurs\` MODIFY COLUMN \`role\` ENUM(\n${enumBody}\n) NOT NULL DEFAULT 'Agent'`;

    await conn.query(sql);
    console.log(`✅ Colonne role mise à jour (${NEW_ROLES.join(', ')} ajoutés).`);
  } catch (e) {
    console.error('❌ Erreur SQL:', e.message);
    if (e.sqlMessage) console.error('   ', e.sqlMessage);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();

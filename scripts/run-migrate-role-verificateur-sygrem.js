/**
 * Renomme uniquement Contrôleur Sygram (accent ô) → Verificateur Sygrem.
 * Controlleur Sygram (sans accent) est conservé comme rôle distinct.
 * Met à jour tbl_utilisateurs.role, tbl_assignation_bl_controleur.role_cible et les ENUM.
 *
 * Variables : backend/.env (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)
 */
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const NEW_ROLE = 'Verificateur Sygrem';
/** Seul l’ancien libellé avec accent est migré. */
const LEGACY_ROLE_ACCENT = 'Contrôleur Sygram';

/** Liste canonique (alignée User.js) — sans les anciens rôles contrôleur. */
const CANONICAL_ROLES = [
  'Agent',
  'Agent Chambre',
  'Agent Exterieur',
  'Agent Gouvernant',
  'Administrateur',
  'Auditeur',
  'Booker',
  'call_center',
  'Gestionnaire des Plaintes',
  'Directeur Opérations',
  'Directeur Operations',
  'Guichetier',
  'Patron',
  'Saisisseur',
  NEW_ROLE,
  'Controlleur Sygram',
  'Superviseur',
  'Superviseur Buanderie',
  'Superviseur Comptable',
  'Superviseur Finance',
  'Superviseur Housing',
  'Superviseur RH',
  'Superviseur Resto',
  'Superviseur Stock',
  'Superviseur Technique',
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

async function getDistinctUserRoles(conn) {
  const [rows] = await conn.query(
    `SELECT DISTINCT role AS r FROM tbl_utilisateurs WHERE role IS NOT NULL AND TRIM(role) <> ''`
  );
  return rows.map((row) => toNfc(row.r)).filter(Boolean);
}

function buildRoleEnumLabels(extraLabels = []) {
  const mergedLabels = [...CANONICAL_ROLES.map(toNfc), ...extraLabels.map(toNfc)];
  const enumByFold = new Map();
  for (const label of mergedLabels) {
    const k = accentFoldKey(label);
    enumByFold.set(k, pickCanonicalLabel(k) || label);
  }
  if (!enumByFold.has(accentFoldKey(NEW_ROLE))) {
    enumByFold.set(accentFoldKey(NEW_ROLE), NEW_ROLE);
  }
  return [...enumByFold.values()].sort((a, b) =>
    a.localeCompare(b, 'fr', { sensitivity: 'variant' })
  );
}

function buildFinalUserRoleEnum(fromDbAfterUpdate) {
  const enumByFold = new Map();
  const mergedLabels = [...CANONICAL_ROLES.map(toNfc), ...fromDbAfterUpdate];
  for (const label of mergedLabels) {
    const k = accentFoldKey(label);
    if (accentFoldKey(LEGACY_ROLE_ACCENT) === k) continue;
    enumByFold.set(k, pickCanonicalLabel(k) || label);
  }
  if (!enumByFold.has(accentFoldKey(NEW_ROLE))) {
    enumByFold.set(accentFoldKey(NEW_ROLE), NEW_ROLE);
  }
  return [...enumByFold.values()].sort((a, b) =>
    a.localeCompare(b, 'fr', { sensitivity: 'variant' })
  );
}

async function alterUserRoleEnum(conn, labels) {
  const enumBody = labels.map((v) => `  '${escapeEnumValue(v)}'`).join(',\n');
  await conn.query(
    `ALTER TABLE \`tbl_utilisateurs\` MODIFY COLUMN \`role\` ENUM(\n${enumBody}\n) NOT NULL DEFAULT 'Agent'`
  );
}

async function main() {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(String(process.env.DB_PORT || 3306), 10);
  const database = process.env.DB_NAME || 'asmdb';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';

  console.log(`Migration rôle → ${NEW_ROLE}`);
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
    const rolesBefore = await getDistinctUserRoles(conn);
    const expandLabels = buildRoleEnumLabels([
      ...rolesBefore,
      LEGACY_ROLE_ACCENT,
      NEW_ROLE
    ]);
    await alterUserRoleEnum(conn, expandLabels);
    console.log('  ENUM tbl_utilisateurs élargi (Verificateur Sygrem ajouté).');

    const [resUsers] = await conn.query(
      'UPDATE tbl_utilisateurs SET role = ? WHERE role = ?',
      [NEW_ROLE, LEGACY_ROLE_ACCENT]
    );
    const nUsers = resUsers.affectedRows ?? 0;
    if (nUsers > 0) {
      console.log(`  tbl_utilisateurs : ${JSON.stringify(LEGACY_ROLE_ACCENT)} → ${NEW_ROLE} (${nUsers} ligne(s))`);
    }

    const [tableExists] = await conn.query(
      `SELECT 1 FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tbl_assignation_bl_controleur' LIMIT 1`,
      [database]
    );
    if (tableExists.length > 0) {
      const [assignCols] = await conn.query(
        `SHOW COLUMNS FROM tbl_assignation_bl_controleur LIKE 'role_cible'`
      );
      const type = String(assignCols[0]?.Type || '');
      if (!type.includes(escapeEnumValue(NEW_ROLE))) {
        await conn.query(
          `ALTER TABLE \`tbl_assignation_bl_controleur\`
           MODIFY COLUMN \`role_cible\` ENUM('${escapeEnumValue(LEGACY_ROLE_ACCENT)}','${escapeEnumValue(NEW_ROLE)}') NOT NULL DEFAULT '${escapeEnumValue(NEW_ROLE)}'`
        );
      }
      const [resAssign] = await conn.query(
        'UPDATE tbl_assignation_bl_controleur SET role_cible = ? WHERE role_cible = ?',
        [NEW_ROLE, LEGACY_ROLE_ACCENT]
      );
      const nAssign = resAssign.affectedRows ?? 0;
      if (nAssign > 0) {
        console.log(`  tbl_assignation_bl_controleur.role_cible → ${NEW_ROLE} (${nAssign} ligne(s))`);
      }
      await conn.query(
        `ALTER TABLE \`tbl_assignation_bl_controleur\`
         MODIFY COLUMN \`role_cible\` ENUM('${escapeEnumValue(NEW_ROLE)}') NOT NULL DEFAULT '${escapeEnumValue(NEW_ROLE)}'`
      );
      console.log('  ENUM role_cible (assignations contrôle) mis à jour.');
    }

    const rolesAfter = await getDistinctUserRoles(conn);
    const finalEnum = buildFinalUserRoleEnum(rolesAfter);
    await alterUserRoleEnum(conn, finalEnum);
    console.log(`✅ ENUM tbl_utilisateurs.role final (${NEW_ROLE}, sans ${LEGACY_ROLE_ACCENT}).`);
  } catch (e) {
    console.error('❌ Erreur SQL:', e.message);
    if (e.sqlMessage) console.error('   ', e.sqlMessage);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();

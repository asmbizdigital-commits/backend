/**
 * Ajoute la valeur ENUM call_center sur tbl_utilisateurs.role.
 * Fusionne les rôles présents en base, déduplique selon la même logique que
 * utf8mb4_unicode_ci (sinon MySQL refuse « ENUM dupliqué » pour Opérations/Operations, etc.).
 *
 * Variables : backend/.env (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD).
 */
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

/** Ordre = priorité de graphie « officielle » si plusieurs variantes se confondent. */
const CANONICAL_ROLES = [
  'Agent',
  'Agent Chambre',
  'Agent Exterieur',
  'Agent Gouvernant',
  'Administrateur',
  'Auditeur',
  'Booker',
  'call_center',
  'Verificateur Sygrem',
  'Gestionnaire des Plaintes',
  'Directeur Opérations',
  'Directeur Operations',
  'Guichetier',
  'Patron',
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
  'Web Master'
];

function escapeEnumValue(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/'/g, "''");
}

/**
 * Clé de fusion pour les libellés ENUM : insensible aux accents (comme une comparaison
 * utf8mb4_unicode_ci sur les chaînes « proches »).
 */
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

/** NFC pour stockage propre (évite NFD/NFC en double côté JS). */
function toNfc(s) {
  return String(s).trim().normalize('NFC');
}

/**
 * Pour une clé accentFold, retourne la graphie préférée (première dans CANONICAL_ROLES qui matche).
 */
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

  console.log('Migration rôle call_center (ENUM dédupliqué + alignement BDD)');
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
    const fromDb = rows.map((row) => {
      const v = row.r;
      return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
    }).filter(Boolean);

    const allLabels = new Set([...CANONICAL_ROLES.map(toNfc), ...fromDb.map(toNfc)]);

    /** @type {Map<string, Set<string>>} */
    const groups = new Map();
    for (const raw of allLabels) {
      const k = accentFoldKey(raw);
      if (!groups.has(k)) groups.set(k, new Set());
      groups.get(k).add(raw);
    }

    const remapLog = [];
    for (const [key, set] of groups) {
      const variants = [...set];
      if (variants.length <= 1) continue;

      const preferred = pickCanonicalLabel(key);
      const winner = preferred || variants.slice().sort((a, b) => a.localeCompare(b, 'fr'))[0];

      for (const v of variants) {
        if (v === winner) continue;
        const [res] = await conn.query(
          'UPDATE tbl_utilisateurs SET role = ? WHERE role = ?',
          [winner, v]
        );
        const n = res.affectedRows ?? 0;
        if (n > 0) remapLog.push({ from: v, to: winner, rows: n });
      }
    }

    if (remapLog.length > 0) {
      console.log('Alignement des variantes de rôle vers la graphie canonique :');
      remapLog.forEach((x) =>
        console.log(`  ${JSON.stringify(x.from)} → ${JSON.stringify(x.to)} (${x.rows} ligne(s))`)
      );
      console.log('');
    }

    const [rowsAfter] = await conn.query(
      `SELECT DISTINCT role AS r FROM tbl_utilisateurs WHERE role IS NOT NULL AND TRIM(role) <> ''`
    );
    const distinctInTable = rowsAfter.map((row) => toNfc(row.r)).filter(Boolean);

    /** Une seule entrée ENUM par clef accentFold (ex. Directeur Opérations vs Operations). */
    const mergedLabels = [...CANONICAL_ROLES.map(toNfc), ...distinctInTable];
    const enumByFold = new Map();
    for (const label of mergedLabels) {
      const k = accentFoldKey(label);
      enumByFold.set(k, pickCanonicalLabel(k) || label);
    }
    const sortedEnum = [...enumByFold.values()].sort((a, b) =>
      a.localeCompare(b, 'fr', { sensitivity: 'variant' })
    );

    const canonicalFold = new Set(CANONICAL_ROLES.map((c) => accentFoldKey(c)));
    const unknownInDb = distinctInTable.filter((r) => !canonicalFold.has(accentFoldKey(r)));
    if (unknownInDb.length > 0) {
      console.log('Rôles encore présents après fusion (hors liste canonique) :');
      [...new Set(unknownInDb)].forEach((r) => console.log(`  - ${JSON.stringify(r)}`));
      console.log('');
    }

    const enumBody = sortedEnum.map((v) => `  '${escapeEnumValue(v)}'`).join(',\n');
    const sql = `ALTER TABLE \`tbl_utilisateurs\` MODIFY COLUMN \`role\` ENUM(\n${enumBody}\n) NOT NULL DEFAULT 'Agent'`;

    await conn.query(sql);
    console.log('✅ Colonne role mise à jour (call_center + ENUM sans doublon collation).');
  } catch (e) {
    console.error('❌ Erreur SQL:', e.message);
    if (e.sqlMessage) console.error('   ', e.sqlMessage);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();

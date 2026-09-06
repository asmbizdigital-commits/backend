#!/usr/bin/env node
/**
 * Audit IDOR / BOLA — lectures seules (GET).
 *
 * Usage:
 *   node scripts/idor-bola-audit.js
 *   IDOR_API_BASE=https://backend-pqag.onrender.com/api node scripts/idor-bola-audit.js
 *
 * Stratégie :
 * 1) Sélectionne un compte attaquant à faible privilège (Agent / Saisisseur / Booker…)
 * 2) Sélectionne des objets appartenant à d’autres utilisateurs / employés
 * 3) Émet un JWT valide (même secret que le serveur) pour l’attaquant
 * 4) Tente d’accéder aux objets victimes → VULN si 200 avec payload
 *
 * Ne fait aucun PUT/DELETE/POST destructif.
 */
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { generateToken } = require('../server/middleware/auth');

const API_BASE = (process.env.IDOR_API_BASE || 'https://backend-pqag.onrender.com/api').replace(/\/$/, '');
const LOW_ROLES = [
  'Agent',
  'Agent Chambre',
  'Agent Exterieur',
  'Booker',
  'Saisisseur',
  'Guichetier',
  'call_center'
];

function verdictFromStatus(status, body) {
  if (status === 401 || status === 403) return 'PROTECTED';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'ERROR';
  if (status >= 200 && status < 300) {
    // Empty / null success without data may still leak existence
    if (body && typeof body === 'object') {
      const keys = Object.keys(body);
      if (keys.length === 0) return 'VULN_EMPTY';
      if (body.success === false && (body.message || body.error)) return 'PROTECTED_SOFT';
      if (body.data === null && body.success === true && keys.length <= 2) return 'LEAK_NULL';
    }
    return 'VULN';
  }
  return `OTHER_${status}`;
}

async function apiGet(token, routePath) {
  const url = `${API_BASE}${routePath.startsWith('/') ? routePath : `/${routePath}`}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });
  let body = null;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { _raw: text.slice(0, 200) };
  }
  return { status: res.status, body, url };
}

async function pickIds(conn) {
  const [attackers] = await conn.query(
    `SELECT id, email, role, nom, prenom, token_version, actif
     FROM tbl_utilisateurs
     WHERE actif = 1 AND role IN (?)
     ORDER BY id ASC
     LIMIT 20`,
    [LOW_ROLES]
  );

  const [admins] = await conn.query(
    `SELECT id, email, role FROM tbl_utilisateurs
     WHERE actif = 1 AND role IN ('Administrateur','Patron')
     ORDER BY id ASC LIMIT 5`
  );

  const [files] = await conn.query(
    `SELECT id, user_id, nom_fichier FROM tbl_files
     WHERE (supprime = 0 OR supprime IS NULL)
     ORDER BY id DESC LIMIT 30`
  );

  const [employees] = await conn.query(
    `SELECT id, nom_famille AS nom, prenoms AS prenom FROM tbl_employes ORDER BY id DESC LIMIT 20`
  ).catch(() => [[]]);

  const [users] = await conn.query(
    `SELECT id, email, role FROM tbl_utilisateurs WHERE actif = 1 ORDER BY id DESC LIMIT 30`
  );

  const [caisses] = await conn.query(
    `SELECT id, nom FROM tbl_caisses ORDER BY id DESC LIMIT 10`
  ).catch(() => [[]]);

  const [connaissements] = await conn.query(
    `SELECT id FROM connaissements ORDER BY id DESC LIMIT 15`
  ).catch(async () => {
    try {
      return await conn.query(`SELECT id FROM tbl_connaissements ORDER BY id DESC LIMIT 15`);
    } catch {
      return [[]];
    }
  });

  const [assignations] = await conn.query(
    `SELECT id, assignee_id FROM tbl_assignations_bl ORDER BY id DESC LIMIT 15`
  ).catch(() => [[]]);

  const [dependants] = await conn.query(
    `SELECT id, employe_id FROM tbl_dependants ORDER BY id DESC LIMIT 10`
  ).catch(() => [[]]);

  const [sanctions] = await conn.query(
    `SELECT id, employe_id FROM tbl_sanctions ORDER BY id DESC LIMIT 10`
  ).catch(() => [[]]);

  const [liaisons] = await conn.query(
    `SELECT id, user_id, employe_id FROM tbl_employe_utilisateur ORDER BY id DESC LIMIT 15`
  ).catch(() => [[]]);

  return {
    attackers,
    admins,
    files,
    employees,
    users,
    caisses,
    connaissements,
    assignations,
    dependants,
    sanctions,
    liaisons
  };
}

function chooseAttacker(attackers, victimUserId) {
  return (
    attackers.find((u) => Number(u.id) !== Number(victimUserId)) ||
    attackers[0] ||
    null
  );
}

async function main() {
  const started = new Date().toISOString();
  console.log(`\n🔍 IDOR/BOLA audit — ${started}`);
  console.log(`   API: ${API_BASE}\n`);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const data = await pickIds(conn);
  await conn.end();

  if (!data.attackers.length) {
    console.error('❌ Aucun utilisateur faible privilège actif trouvé (rôles Agent/Saisisseur/…).');
    process.exit(1);
  }

  // Victim resources preferably owned by someone else
  const victimFile =
    data.files.find((f) => f.user_id && Number(f.user_id) !== Number(data.attackers[0].id)) ||
    data.files[0];
  const attacker = chooseAttacker(data.attackers, victimFile?.user_id);
  if (!attacker) {
    console.error('❌ Attaquant introuvable');
    process.exit(1);
  }

  const token = generateToken(attacker.id, {
    expiresIn: '30m',
    tokenVersion: attacker.token_version || 0
  });

  console.log(
    `👤 Attaquant: #${attacker.id} ${attacker.email} [${attacker.role}] (tv=${attacker.token_version || 0})`
  );

  const otherUser =
    data.users.find((u) => Number(u.id) !== Number(attacker.id) && u.role !== attacker.role) ||
    data.users.find((u) => Number(u.id) !== Number(attacker.id));
  const otherEmployee = data.employees.find((e) => e.id) || null;
  const otherCaisse = data.caisses[0] || null;
  const otherBl = data.connaissements[0] || null;
  const otherAssign =
    data.assignations.find((a) => Number(a.assignee_id) !== Number(attacker.id)) ||
    data.assignations[0];
  const otherDependant = data.dependants[0] || null;
  const otherSanction = data.sanctions[0] || null;
  const otherLiaison =
    data.liaisons.find((l) => Number(l.user_id) !== Number(attacker.id)) || data.liaisons[0];
  const adminUser = data.admins[0] || null;

  /** @type {{id:string, method:string, path:string, expect:string, note:string}[]} */
  const cases = [];

  // Baseline: unauthenticated must fail
  cases.push({
    id: 'BASE-401',
    method: 'GET',
    path: '/users',
    token: null,
    expect: 'PROTECTED',
    note: 'Sans jeton → 401'
  });

  // Self vs other user profile
  cases.push({
    id: 'USR-SELF',
    method: 'GET',
    path: `/users/${attacker.id}`,
    expect: 'VULN',
    note: 'Propre profil (attendu OK)'
  });
  if (otherUser) {
    cases.push({
      id: 'USR-OTHER',
      method: 'GET',
      path: `/users/${otherUser.id}`,
      expect: 'PROTECTED',
      note: `Profil tiers #${otherUser.id} ${otherUser.role}`
    });
  }
  if (adminUser) {
    cases.push({
      id: 'USR-ADMIN',
      method: 'GET',
      path: `/users/${adminUser.id}`,
      expect: 'PROTECTED',
      note: `Profil admin #${adminUser.id}`
    });
  }

  if (victimFile) {
    cases.push({
      id: 'FILE-META',
      method: 'GET',
      path: `/files/${victimFile.id}`,
      expect: 'PROTECTED',
      note: `Fichier tiers #${victimFile.id} owner=${victimFile.user_id}`
    });
    cases.push({
      id: 'FILE-DL',
      method: 'GET',
      path: `/files/${victimFile.id}/download`,
      expect: 'PROTECTED',
      note: `Download fichier tiers #${victimFile.id}`
    });
  }

  if (otherEmployee) {
    cases.push({
      id: 'EMP-GET',
      method: 'GET',
      path: `/employees/${otherEmployee.id}`,
      expect: 'PROTECTED',
      note: `Employé #${otherEmployee.id}`
    });
    cases.push({
      id: 'EMP-PAY',
      method: 'GET',
      path: `/paiements/employe/${otherEmployee.id}`,
      expect: 'PROTECTED',
      note: `Paiements employé #${otherEmployee.id}`
    });
    cases.push({
      id: 'EMP-DEP',
      method: 'GET',
      path: `/dependants/employe/${otherEmployee.id}`,
      expect: 'PROTECTED',
      note: `Dépendants employé #${otherEmployee.id}`
    });
    cases.push({
      id: 'EMP-SAN',
      method: 'GET',
      path: `/sanctions/employe/${otherEmployee.id}`,
      expect: 'PROTECTED',
      note: `Sanctions employé #${otherEmployee.id}`
    });
    cases.push({
      id: 'EMP-GRA',
      method: 'GET',
      path: `/gratifications/employe/${otherEmployee.id}`,
      expect: 'PROTECTED',
      note: `Gratifications employé #${otherEmployee.id}`
    });
  }

  if (otherDependant) {
    cases.push({
      id: 'DEP-ID',
      method: 'GET',
      path: `/dependants/${otherDependant.id}`,
      expect: 'PROTECTED',
      note: `Dépendant #${otherDependant.id}`
    });
  }
  if (otherSanction) {
    cases.push({
      id: 'SAN-ID',
      method: 'GET',
      path: `/sanctions/${otherSanction.id}`,
      expect: 'PROTECTED',
      note: `Sanction #${otherSanction.id}`
    });
  }

  if (otherLiaison) {
    cases.push({
      id: 'LIAISON-UID',
      method: 'GET',
      path: `/employe-utilisateur?user_id=${otherLiaison.user_id}`,
      expect: 'PROTECTED',
      note: `Liaison user_id=${otherLiaison.user_id}`
    });
    cases.push({
      id: 'LIAISON-LIST',
      method: 'GET',
      path: `/employe-utilisateur/list`,
      expect: 'PROTECTED',
      note: 'Liste complète liaisons employé↔user'
    });
  }

  if (otherCaisse) {
    cases.push({
      id: 'CAISSE-GET',
      method: 'GET',
      path: `/caisses/${otherCaisse.id}`,
      expect: 'PROTECTED',
      note: `Caisse #${otherCaisse.id}`
    });
  }

  if (otherBl) {
    cases.push({
      id: 'BL-DOCS',
      method: 'GET',
      path: `/connaissements/${otherBl.id}/docs-feri`,
      expect: 'PROTECTED',
      note: `Docs FERI BL #${otherBl.id}`
    });
    cases.push({
      id: 'BL-ZIP',
      method: 'GET',
      path: `/connaissements/${otherBl.id}/docs-zip`,
      expect: 'PROTECTED',
      note: `Docs ZIP BL #${otherBl.id}`
    });
    cases.push({
      id: 'BL-FICHE',
      method: 'GET',
      path: `/connaissements/${otherBl.id}/fiche-detail`,
      expect: 'PROTECTED',
      note: `Fiche détail BL #${otherBl.id}`
    });
  }

  if (otherAssign) {
    cases.push({
      id: 'ASSIGN-GET',
      method: 'GET',
      path: `/assignations-bl/${otherAssign.id}`,
      expect: 'PROTECTED',
      note: `Assignation #${otherAssign.id} assignee=${otherAssign.assignee_id}`
    });
  }

  // Finance sample (role-gated — may be PROTECTED for Agent)
  cases.push({
    id: 'FIN-FACTURE-1',
    method: 'GET',
    path: `/finances/factures/1`,
    expect: 'PROTECTED',
    note: 'Facture #1 (rôle finance attendu)'
  });

  const results = [];
  for (const c of cases) {
    const useToken = Object.prototype.hasOwnProperty.call(c, 'token') ? c.token : token;
    let status;
    let body;
    let url;
    try {
      if (!useToken && c.id === 'BASE-401') {
        const r = await fetch(`${API_BASE}${c.path}`, { headers: { Accept: 'application/json' } });
        status = r.status;
        try {
          body = await r.json();
        } catch {
          body = null;
        }
        url = `${API_BASE}${c.path}`;
      } else {
        const r = await apiGet(useToken, c.path);
        status = r.status;
        body = r.body;
        url = r.url;
      }
    } catch (err) {
      results.push({
        ...c,
        status: 0,
        verdict: 'ERROR',
        detail: err.message,
        pass: false
      });
      console.log(`  ✗ ${c.id} ERROR ${err.message}`);
      continue;
    }

    const verdict = verdictFromStatus(status, body);
    // Expected VULN means "legitimate access OK" for self endpoints
    let pass;
    if (c.expect === 'VULN') {
      pass = verdict === 'VULN' || verdict === 'VULN_EMPTY';
    } else if (c.expect === 'PROTECTED') {
      pass =
        verdict === 'PROTECTED' ||
        verdict === 'NOT_FOUND' ||
        verdict === 'PROTECTED_SOFT' ||
        // 404 can be intentional hiding; still not a confirmed IDOR
        false;
      // Confirmed vulnerability only on VULN*
      if (verdict === 'VULN' || verdict === 'VULN_EMPTY' || verdict === 'LEAK_NULL') {
        pass = false;
      } else if (verdict === 'NOT_FOUND' || verdict === 'PROTECTED' || verdict === 'PROTECTED_SOFT') {
        pass = true;
      } else {
        pass = false;
      }
    } else {
      pass = verdict === c.expect;
    }

    const isIdor =
      c.expect === 'PROTECTED' &&
      (verdict === 'VULN' || verdict === 'VULN_EMPTY' || verdict === 'LEAK_NULL');

    results.push({
      id: c.id,
      path: c.path,
      note: c.note,
      status,
      verdict,
      expect: c.expect,
      pass,
      isIdor,
      sampleKeys: body && typeof body === 'object' ? Object.keys(body).slice(0, 8) : []
    });

    const mark = isIdor ? '🚨 VULN' : pass ? '✅' : '⚠️';
    console.log(
      `  ${mark} ${c.id} HTTP ${status} ${verdict} — ${c.note}`
    );
  }

  const idors = results.filter((r) => r.isIdor);
  const protectedOk = results.filter((r) => r.pass && r.expect === 'PROTECTED');
  const failed = results.filter((r) => !r.pass && !r.isIdor);

  const report = {
    started,
    finished: new Date().toISOString(),
    api: API_BASE,
    attacker: {
      id: attacker.id,
      email: attacker.email,
      role: attacker.role
    },
    summary: {
      total: results.length,
      idor_confirmed: idors.length,
      protected_ok: protectedOk.length,
      other_anomalies: failed.length
    },
    idors,
    results
  };

  const outJson = path.join(__dirname, '../../docs/RAPPORT_IDOR_BOLA_2026-09-06.json');
  const outMd = path.join(__dirname, '../../docs/RAPPORT_IDOR_BOLA_2026-09-06.md');
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2), 'utf8');

  const md = `# Rapport tests IDOR / BOLA — Synaptasys

**Date :** ${started.slice(0, 10)}  
**API testée :** \`${API_BASE}\`  
**Attaquant :** #${attacker.id} \`${attacker.email}\` — rôle **${attacker.role}**  
**Méthode :** lectures GET uniquement (pas de mutation)  
**Auth :** JWT Bearer émis pour un compte faible privilège (secret applicatif local)

---

## Synthèse

| Indicateur | Valeur |
|------------|--------|
| Cas testés | ${results.length} |
| **IDOR confirmés (HTTP 2xx sur objet tiers)** | **${idors.length}** |
| Accès correctement bloqués / masqués | ${protectedOk.length} |
| Autres anomalies | ${failed.length} |

${
  idors.length
    ? `> **Verdict :** des failles **IDOR/BOLA** sont confirmées. Priorité de correction sur fichiers, RH et dossiers.`
    : `> **Verdict :** aucun IDOR confirmé sur l’échantillon testé (ou objets absents / rôles trop restreints).`
}

---

## IDOR confirmés

${
  idors.length
    ? idors
        .map(
          (r) =>
            `| ${r.id} | \`${r.path}\` | HTTP ${r.status} | ${r.note} |`
        )
        .join('\n')
        .replace(/^/, '| ID | Endpoint | Status | Note |\n|----|----------|--------|------|\n')
    : '_Aucun._'
}

---

## Détail de tous les cas

| ID | Attendu | Verdict | HTTP | Endpoint | Note |
|----|---------|---------|------|----------|------|
${results
  .map(
    (r) =>
      `| ${r.id} | ${r.expect} | ${r.verdict}${r.isIdor ? ' 🚨' : ''} | ${r.status} | \`${r.path}\` | ${r.note} |`
  )
  .join('\n')}

---

## Interprétation

- **VULN** sur un cas \`expect=PROTECTED\` = **IDOR/BOLA** : un utilisateur non autorisé a lu la ressource d’un tiers en changeant l’identifiant.
- **PROTECTED** / **NOT_FOUND** = contrôle d’accès ou masquage OK pour ce cas.
- **USR-SELF** attendu en succès (accès à son propre profil).

## Recommandations

1. Appliquer un contrôle **object-level** (propriétaire / assignation / bureau / rôle RH) sur chaque \`GET/PUT/DELETE /:id\`.
2. Réutiliser ou étendre \`canAccessResource\` (aujourd’hui peu branché).
3. Pour les fichiers : owner ou Admin uniquement (y compris download / delete).
4. Pour RH (employés, dépendants, sanctions, paiements) : rôles RH ou liaison employé↔user.
5. Pour connaissements/docs : même ACL que la fiche (\`ensureManagerBureauConnaissementAccess\` + assignation).

---

*Rapport généré automatiquement — \`backend/scripts/idor-bola-audit.js\`.*
`;

  fs.writeFileSync(outMd, md, 'utf8');
  console.log(`\n📄 Rapport: ${outMd}`);
  console.log(`📦 JSON:   ${outJson}`);
  console.log(
    `\nRésumé: ${idors.length} IDOR / ${protectedOk.length} protégés / ${failed.length} anomalies\n`
  );

  process.exit(idors.length > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

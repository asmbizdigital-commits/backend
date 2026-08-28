/**
 * Réattribue dossiers / assignations / logs « assigné par » du compte
 * Manager Bureau Hugor SOKI (id 248) vers MULAMBA Sissé (id 156).
 *
 * Ne touche PAS au compte Responsable Zone hugor soki (id 111).
 *
 * Usage: node backend/scripts/fix-hugor-soki-to-mulamba-manager-bureau.js
 */
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const TARGET_ID = 156; // MULAMBA Sissé — Manager Bureau
/** Compte Manager Bureau uniquement (email hugor@…, actor_name « Hugor SOKI »). */
const SOURCE_IDS = [248];

async function main() {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(String(process.env.DB_PORT || 3306), 10);
  const database = process.env.DB_NAME || 'asmdb';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';

  console.log(`Connexion → ${user}@${host}:${port}/${database}`);

  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database
  });

  try {
    const [targetRows] = await conn.query(
      `SELECT id, prenom, nom, role, email, bureau_international_id
       FROM tbl_utilisateurs WHERE id = ?`,
      [TARGET_ID]
    );
    if (!targetRows.length) {
      throw new Error(`Cible id=${TARGET_ID} introuvable`);
    }
    const target = targetRows[0];
    const targetName = `${String(target.prenom || '').trim()} ${String(target.nom || '').trim()}`.trim();
    const targetRole = target.role || 'Manager Bureau';
    console.log('Cible:', {
      id: target.id,
      name: targetName,
      role: targetRole,
      email: target.email,
      bureau: target.bureau_international_id
    });

    const [sources] = await conn.query(
      `SELECT id, prenom, nom, role, email, bureau_international_id
       FROM tbl_utilisateurs WHERE id IN (${SOURCE_IDS.map(() => '?').join(',')})`,
      SOURCE_IDS
    );
    console.log('Sources (Manager Bureau uniquement):', sources);

    for (const sid of SOURCE_IDS) {
      if (!sources.some((s) => Number(s.id) === sid)) {
        throw new Error(`Source id=${sid} introuvable`);
      }
      if (sid === TARGET_ID) {
        throw new Error('Source et cible identiques — abort');
      }
    }

    const badRole = sources.find((s) => String(s.role || '').trim() !== 'Manager Bureau');
    if (badRole) {
      throw new Error(
        `Abort : id=${badRole.id} a le rôle « ${badRole.role} » (attendu Manager Bureau)`
      );
    }

    const placeholders = SOURCE_IDS.map(() => '?').join(',');

    const [[{ nSaisi }]] = await conn.query(
      `SELECT COUNT(*) AS nSaisi FROM tbl_assignations_bl WHERE assigne_par_id IN (${placeholders})`,
      SOURCE_IDS
    );
    const [[{ nCtrl }]] = await conn.query(
      `SELECT COUNT(*) AS nCtrl FROM tbl_assignation_bl_controleur WHERE assigne_par_id IN (${placeholders})`,
      SOURCE_IDS
    );
    const [[{ nAct }]] = await conn.query(
      `SELECT COUNT(*) AS nAct FROM tbl_dossier_activity_log WHERE actor_id IN (${placeholders})`,
      SOURCE_IDS
    );
    const [[{ nActName }]] = await conn.query(
      `SELECT COUNT(*) AS nActName
       FROM tbl_dossier_activity_log
       WHERE actor_id IS NULL
         AND (
           (LOWER(actor_name) LIKE '%hugor%' AND LOWER(actor_name) LIKE '%soki%')
         )`
    );

    console.log({
      assignations_saisisseur_assigne_par: Number(nSaisi),
      assignations_controleur_assigne_par: Number(nCtrl),
      activity_actor_id: Number(nAct),
      activity_actor_name_null_id: Number(nActName)
    });

    if (Number(nSaisi) + Number(nCtrl) + Number(nAct) + Number(nActName) === 0) {
      console.log('Rien à mettre à jour. Fin.');
      return;
    }

    await conn.beginTransaction();
    try {
      const [rSaisi] = await conn.query(
        `UPDATE tbl_assignations_bl
         SET assigne_par_id = ?, updated_at = NOW()
         WHERE assigne_par_id IN (${placeholders})`,
        [TARGET_ID, ...SOURCE_IDS]
      );
      console.log(`UPDATE tbl_assignations_bl.assigne_par_id: ${rSaisi.affectedRows}`);

      const [rCtrl] = await conn.query(
        `UPDATE tbl_assignation_bl_controleur
         SET assigne_par_id = ?, updated_at = NOW()
         WHERE assigne_par_id IN (${placeholders})`,
        [TARGET_ID, ...SOURCE_IDS]
      );
      console.log(`UPDATE tbl_assignation_bl_controleur.assigne_par_id: ${rCtrl.affectedRows}`);

      const [rAct] = await conn.query(
        `UPDATE tbl_dossier_activity_log
         SET actor_id = ?,
             actor_name = ?,
             actor_role = ?
         WHERE actor_id IN (${placeholders})`,
        [TARGET_ID, targetName, targetRole, ...SOURCE_IDS]
      );
      console.log(`UPDATE tbl_dossier_activity_log by actor_id: ${rAct.affectedRows}`);

      let rActNameRows = 0;
      if (Number(nActName) > 0) {
        const [rActName] = await conn.query(
          `UPDATE tbl_dossier_activity_log
           SET actor_id = ?,
               actor_name = ?,
               actor_role = ?
           WHERE actor_id IS NULL
             AND LOWER(actor_name) LIKE '%hugor%'
             AND LOWER(actor_name) LIKE '%soki%'`
          ,
          [TARGET_ID, targetName, targetRole]
        );
        rActNameRows = rActName.affectedRows;
        console.log(`UPDATE tbl_dossier_activity_log by actor_name: ${rActNameRows}`);
      }

      const [[{ resteSaisi }]] = await conn.query(
        `SELECT COUNT(*) AS resteSaisi FROM tbl_assignations_bl WHERE assigne_par_id IN (${placeholders})`,
        SOURCE_IDS
      );
      const [[{ resteCtrl }]] = await conn.query(
        `SELECT COUNT(*) AS resteCtrl FROM tbl_assignation_bl_controleur WHERE assigne_par_id IN (${placeholders})`,
        SOURCE_IDS
      );
      const [[{ resteAct }]] = await conn.query(
        `SELECT COUNT(*) AS resteAct FROM tbl_dossier_activity_log WHERE actor_id IN (${placeholders})`,
        SOURCE_IDS
      );
      const [[{ countMulambaSaisi }]] = await conn.query(
        `SELECT COUNT(*) AS countMulambaSaisi FROM tbl_assignations_bl WHERE assigne_par_id = ?`,
        [TARGET_ID]
      );
      const [[{ countMulambaCtrl }]] = await conn.query(
        `SELECT COUNT(*) AS countMulambaCtrl FROM tbl_assignation_bl_controleur WHERE assigne_par_id = ?`,
        [TARGET_ID]
      );
      const [[{ countMulambaAct }]] = await conn.query(
        `SELECT COUNT(*) AS countMulambaAct FROM tbl_dossier_activity_log WHERE actor_id = ?`,
        [TARGET_ID]
      );

      if (Number(resteSaisi) !== 0 || Number(resteCtrl) !== 0 || Number(resteAct) !== 0) {
        throw new Error(
          `Rollback : reste saisi=${resteSaisi} ctrl=${resteCtrl} act=${resteAct}`
        );
      }
      if (Number(rSaisi.affectedRows) !== Number(nSaisi)) {
        throw new Error(`Rollback saisi: expected ${nSaisi}, got ${rSaisi.affectedRows}`);
      }
      if (Number(rCtrl.affectedRows) !== Number(nCtrl)) {
        throw new Error(`Rollback ctrl: expected ${nCtrl}, got ${rCtrl.affectedRows}`);
      }
      if (Number(rAct.affectedRows) !== Number(nAct)) {
        throw new Error(`Rollback act: expected ${nAct}, got ${rAct.affectedRows}`);
      }

      await conn.commit();
      console.log('✅ COMMIT OK');
      console.log({
        assignations_saisisseur_modifiees: rSaisi.affectedRows,
        assignations_controleur_modifiees: rCtrl.affectedRows,
        activity_modifiees: rAct.affectedRows + rActNameRows,
        maintenant_mulamba_saisi: Number(countMulambaSaisi),
        maintenant_mulamba_ctrl: Number(countMulambaCtrl),
        maintenant_mulamba_activity: Number(countMulambaAct)
      });
    } catch (inner) {
      await conn.rollback();
      console.error('❌ ROLLBACK —', inner.message);
      process.exitCode = 1;
    }
  } catch (e) {
    console.error('❌', e.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();

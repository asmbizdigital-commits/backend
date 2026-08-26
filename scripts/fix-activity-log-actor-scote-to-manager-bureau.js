/**
 * Réattribue atomiquement les événements monitoring (tbl_dossier_activity_log)
 * de SCOTE TSHIPAMBA (actor_id) vers Kabasele Jean de Dieu (id 176).
 *
 * Usage: node backend/scripts/fix-activity-log-actor-scote-to-manager-bureau.js
 */
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const TARGET_ACTOR_ID = 176;

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
    const [scoteRows] = await conn.query(
      `SELECT id, prenom, nom, role, email
       FROM tbl_utilisateurs
       WHERE prenom LIKE ? AND nom LIKE ?
       ORDER BY id ASC
       LIMIT 5`,
      ['%SCOTE%', '%TSHIPAMBA%']
    );

    if (!scoteRows.length) {
      throw new Error('SCOTE TSHIPAMBA introuvable');
    }
    const scote = scoteRows[0];
    const scoteId = scote.id;
    console.log('SCOTE:', { id: scoteId, prenom: scote.prenom, nom: scote.nom, role: scote.role });

    const [targetRows] = await conn.query(
      `SELECT id, prenom, nom, role, email FROM tbl_utilisateurs WHERE id = ?`,
      [TARGET_ACTOR_ID]
    );
    if (!targetRows.length) {
      throw new Error(`Cible id=${TARGET_ACTOR_ID} introuvable`);
    }
    const target = targetRows[0];
    const targetName = `${String(target.prenom || '').trim()} ${String(target.nom || '').trim()}`.trim();
    const targetRole = target.role || 'Manager Bureau';
    console.log('Cible:', { id: target.id, name: targetName, role: targetRole });

    if (scoteId === TARGET_ACTOR_ID) {
      throw new Error('Même id — abort');
    }

    const [[{ beforeCount }]] = await conn.query(
      `SELECT COUNT(*) AS beforeCount
       FROM tbl_dossier_activity_log
       WHERE actor_id = ?`,
      [scoteId]
    );
    const [[{ beforeByName }]] = await conn.query(
      `SELECT COUNT(*) AS beforeByName
       FROM tbl_dossier_activity_log
       WHERE actor_id IS NULL
         AND actor_name LIKE ?`,
      ['%SCOTE%TSHIPAMBA%']
    );

    console.log(`Logs actor_id=SCOTE (${scoteId}): ${beforeCount}`);
    console.log(`Logs actor_name SCOTE (sans actor_id): ${beforeByName}`);

    if (Number(beforeCount) === 0 && Number(beforeByName) === 0) {
      console.log('Rien à mettre à jour. Fin.');
      return;
    }

    // Aperçu action_type avant
    const [byAction] = await conn.query(
      `SELECT action_type, COUNT(*) AS n
       FROM tbl_dossier_activity_log
       WHERE actor_id = ?
       GROUP BY action_type
       ORDER BY n DESC`,
      [scoteId]
    );
    console.log('Répartition action_type (SCOTE):', byAction);

    await conn.beginTransaction();
    try {
      let affected = 0;

      if (Number(beforeCount) > 0) {
        const [r1] = await conn.query(
          `UPDATE tbl_dossier_activity_log
           SET actor_id = ?,
               actor_name = ?,
               actor_role = ?
           WHERE actor_id = ?`,
          [TARGET_ACTOR_ID, targetName, targetRole, scoteId]
        );
        affected += r1.affectedRows;
        console.log(`UPDATE by actor_id: ${r1.affectedRows}`);
      }

      if (Number(beforeByName) > 0) {
        const [r2] = await conn.query(
          `UPDATE tbl_dossier_activity_log
           SET actor_id = ?,
               actor_name = ?,
               actor_role = ?
           WHERE actor_id IS NULL
             AND actor_name LIKE ?`,
          [TARGET_ACTOR_ID, targetName, targetRole, '%SCOTE%TSHIPAMBA%']
        );
        affected += r2.affectedRows;
        console.log(`UPDATE by actor_name: ${r2.affectedRows}`);
      }

      const [[{ resteScote }]] = await conn.query(
        `SELECT COUNT(*) AS resteScote
         FROM tbl_dossier_activity_log
         WHERE actor_id = ?`,
        [scoteId]
      );
      const [[{ resteName }]] = await conn.query(
        `SELECT COUNT(*) AS resteName
         FROM tbl_dossier_activity_log
         WHERE actor_name LIKE ? AND actor_id <> ?`,
        ['%SCOTE%TSHIPAMBA%', TARGET_ACTOR_ID]
      );
      const [[{ countJean }]] = await conn.query(
        `SELECT COUNT(*) AS countJean
         FROM tbl_dossier_activity_log
         WHERE actor_id = ?`,
        [TARGET_ACTOR_ID]
      );
      const [[{ dossiersJean }]] = await conn.query(
        `SELECT COUNT(DISTINCT connaissement_id) AS dossiersJean
         FROM tbl_dossier_activity_log
         WHERE actor_id = ?`,
        [TARGET_ACTOR_ID]
      );

      if (Number(resteScote) !== 0) {
        throw new Error(`Rollback : reste ${resteScote} logs avec actor_id = SCOTE`);
      }

      await conn.commit();
      console.log('✅ COMMIT OK');
      console.log({
        lignes_modifiees: affected,
        reste_scote_actor_id: Number(resteScote),
        reste_scote_actor_name: Number(resteName),
        actions_jean: Number(countJean),
        dossiers_distincts_jean: Number(dossiersJean)
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

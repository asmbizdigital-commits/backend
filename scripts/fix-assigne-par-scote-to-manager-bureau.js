/**
 * Remplace atomiquement assigne_par_id (SCOTE TSHIPAMBA → Jean de Dieu Kabasele id 176)
 * dans tbl_assignations_bl.
 *
 * Usage: node backend/scripts/fix-assigne-par-scote-to-manager-bureau.js
 */
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const TARGET_ASSIGNER_ID = 176; // Jean de Dieu Kabasele — Manager Bureau

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
       WHERE (nom LIKE ? OR prenom LIKE ? OR CONCAT(IFNULL(prenom,''), ' ', IFNULL(nom,'')) LIKE ?)
       ORDER BY id ASC`,
      ['%TSHIPAMBA%', '%SCOTE%', '%SCOTE%TSHIPAMBA%']
    );

    if (!scoteRows.length) {
      throw new Error('Utilisateur SCOTE TSHIPAMBA introuvable dans tbl_utilisateurs');
    }
    if (scoteRows.length > 1) {
      console.warn('Plusieurs candidats SCOTE/TSHIPAMBA :', scoteRows);
    }

    const scote = scoteRows.find(
      (r) =>
        String(r.nom || '').toUpperCase().includes('TSHIPAMBA') &&
        String(r.prenom || '').toUpperCase().includes('SCOTE')
    ) || scoteRows[0];

    const scoteId = scote.id;
    console.log('SCOTE trouvé:', {
      id: scoteId,
      prenom: scote.prenom,
      nom: scote.nom,
      role: scote.role,
      email: scote.email
    });

    const [targetRows] = await conn.query(
      `SELECT id, prenom, nom, role, email FROM tbl_utilisateurs WHERE id = ?`,
      [TARGET_ASSIGNER_ID]
    );
    if (!targetRows.length) {
      throw new Error(`Utilisateur cible id=${TARGET_ASSIGNER_ID} introuvable`);
    }
    const target = targetRows[0];
    console.log('Cible (Manager Bureau):', {
      id: target.id,
      prenom: target.prenom,
      nom: target.nom,
      role: target.role,
      email: target.email
    });

    if (scoteId === TARGET_ASSIGNER_ID) {
      throw new Error('SCOTE et cible ont le même id — abort');
    }

    const [[{ beforeCount }]] = await conn.query(
      `SELECT COUNT(*) AS beforeCount FROM tbl_assignations_bl WHERE assigne_par_id = ?`,
      [scoteId]
    );
    console.log(`Assignations avec assigne_par_id = SCOTE (${scoteId}) : ${beforeCount}`);

    if (Number(beforeCount) === 0) {
      console.log('Rien à mettre à jour. Fin.');
      return;
    }

    await conn.beginTransaction();
    try {
      const [result] = await conn.query(
        `UPDATE tbl_assignations_bl
         SET assigne_par_id = ?, updated_at = NOW()
         WHERE assigne_par_id = ?`,
        [TARGET_ASSIGNER_ID, scoteId]
      );

      const affected = result.affectedRows;
      console.log(`UPDATE affectedRows = ${affected}`);

      const [[{ resteScote }]] = await conn.query(
        `SELECT COUNT(*) AS resteScote FROM tbl_assignations_bl WHERE assigne_par_id = ?`,
        [scoteId]
      );
      const [[{ countJean }]] = await conn.query(
        `SELECT COUNT(*) AS countJean FROM tbl_assignations_bl WHERE assigne_par_id = ?`,
        [TARGET_ASSIGNER_ID]
      );

      if (Number(resteScote) !== 0) {
        throw new Error(`Rollback : il reste ${resteScote} lignes avec assigne_par_id = SCOTE`);
      }
      if (Number(affected) !== Number(beforeCount)) {
        throw new Error(
          `Rollback : expected ${beforeCount} lignes modifiées, got ${affected}`
        );
      }

      await conn.commit();
      console.log('✅ COMMIT OK');
      console.log({
        lignes_modifiees: affected,
        reste_scote: Number(resteScote),
        maintenant_jean_de_dieu: Number(countJean)
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

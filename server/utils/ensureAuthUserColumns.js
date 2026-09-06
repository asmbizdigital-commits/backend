/**
 * Colonnes auth supplémentaires sur tbl_utilisateurs (idempotent).
 */
async function ensureAuthUserColumns(sequelize) {
  const columns = [
    ['token_version', 'INT NOT NULL DEFAULT 0'],
    ['password_reset_token', 'VARCHAR(128) NULL'],
    ['password_reset_expires', 'DATETIME NULL']
  ];

  for (const [colName, colDef] of columns) {
    try {
      const [rows] = await sequelize.query(
        `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'tbl_utilisateurs'
           AND COLUMN_NAME = :col`,
        { replacements: { col: colName } }
      );
      const count = Number(rows?.[0]?.c ?? rows?.[0]?.C ?? 0);
      if (count === 0) {
        await sequelize.query(
          `ALTER TABLE tbl_utilisateurs ADD COLUMN \`${colName}\` ${colDef}`,
          { raw: true }
        );
        console.log(`✅ Colonne tbl_utilisateurs.${colName} ajoutée`);
      }
    } catch (err) {
      console.warn(`⚠️ ensureAuthUserColumns(${colName}):`, err.message);
    }
  }
}

module.exports = { ensureAuthUserColumns };

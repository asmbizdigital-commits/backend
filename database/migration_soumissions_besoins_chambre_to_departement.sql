-- Remplace chambre_id par departement_id sur les lignes de soumissions besoins (matériel)

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tbl_soumissions_besoins_lignes'
    AND CONSTRAINT_NAME = 'fk_sb_lignes_chambre'
);
SET @sql_drop_fk = IF(@fk_exists > 0,
  'ALTER TABLE tbl_soumissions_besoins_lignes DROP FOREIGN KEY fk_sb_lignes_chambre',
  'SELECT 1');
PREPARE stmt FROM @sql_drop_fk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tbl_soumissions_besoins_lignes'
    AND COLUMN_NAME = 'departement_id'
);
SET @sql_add_col = IF(@col_exists = 0,
  'ALTER TABLE tbl_soumissions_besoins_lignes ADD COLUMN departement_id INT NULL AFTER inventaire_id',
  'SELECT 1');
PREPARE stmt FROM @sql_add_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @chambre_col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tbl_soumissions_besoins_lignes'
    AND COLUMN_NAME = 'chambre_id'
);
SET @sql_drop_chambre = IF(@chambre_col > 0,
  'ALTER TABLE tbl_soumissions_besoins_lignes DROP COLUMN chambre_id',
  'SELECT 1');
PREPARE stmt FROM @sql_drop_chambre;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_dept_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tbl_soumissions_besoins_lignes'
    AND CONSTRAINT_NAME = 'fk_sb_lignes_departement'
);
SET @sql_add_fk = IF(@fk_dept_exists = 0,
  'ALTER TABLE tbl_soumissions_besoins_lignes ADD CONSTRAINT fk_sb_lignes_departement FOREIGN KEY (departement_id) REFERENCES tbl_departements (id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql_add_fk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Table des paramètres système par section (general, societe, finances, facturation, affichage)
CREATE TABLE IF NOT EXISTS tbl_parametres_sys (
  id INT NOT NULL AUTO_INCREMENT,
  section VARCHAR(50) NOT NULL COMMENT 'general, societe, finances, facturation, affichage',
  data LONGTEXT NOT NULL COMMENT 'Objet JSON (sérialisé) des clés/valeurs de la section',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_parametres_sys_section (section)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Directions provinciales
CREATE TABLE IF NOT EXISTS tbl_directions_provinciales (
  id INT NOT NULL AUTO_INCREMENT,
  nom VARCHAR(200) NOT NULL COMMENT 'Intitulé de la direction',
  code VARCHAR(30) NULL COMMENT 'Code court unique optionnel',
  province VARCHAR(150) NULL COMMENT 'Province ou région',
  responsable_direction VARCHAR(255) NULL COMMENT 'Nom du responsable de la direction',
  email VARCHAR(255) NULL,
  telephone VARCHAR(50) NULL,
  adresse TEXT NULL,
  statut ENUM('Actif', 'Inactif') NOT NULL DEFAULT 'Actif',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_direction_provinciale_code (code),
  KEY idx_direction_prov_statut (statut),
  KEY idx_direction_prov_nom (nom(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Directions provinciales';

-- Bureaux internationaux
CREATE TABLE IF NOT EXISTS tbl_bureaux_internationaux (
  id INT NOT NULL AUTO_INCREMENT,
  nom VARCHAR(200) NOT NULL COMMENT 'Intitulé du bureau',
  code VARCHAR(30) NULL COMMENT 'Code court unique optionnel',
  pays VARCHAR(150) NULL,
  ville VARCHAR(150) NULL,
  responsable_bureau VARCHAR(255) NULL COMMENT 'Nom du responsable du bureau',
  email VARCHAR(255) NULL,
  telephone VARCHAR(50) NULL,
  adresse TEXT NULL,
  statut ENUM('Actif', 'Inactif') NOT NULL DEFAULT 'Actif',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_bureau_international_code (code),
  KEY idx_bureau_int_statut (statut),
  KEY idx_bureau_int_nom (nom(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Bureaux internationaux';

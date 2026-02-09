-- Table des titres et permis miniers (liés aux opérateurs mines)

CREATE TABLE IF NOT EXISTS `tbl_titres_permis_mines` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `operateur_id` INT(11) NOT NULL COMMENT 'Référence tbl_operateurs_mines',
  `numero_titre` VARCHAR(100) NOT NULL COMMENT 'Numéro du titre / permis',
  `type_titre` ENUM('permis_recherche', 'permis_exploitation', 'concession_miniere', 'autorisation_artisanale', 'autre') NOT NULL DEFAULT 'permis_recherche',
  `date_delivrance` DATE DEFAULT NULL,
  `date_expiration` DATE DEFAULT NULL,
  `superficie_ha` DECIMAL(12,2) DEFAULT NULL,
  `zone` VARCHAR(150) DEFAULT NULL,
  `statut` ENUM('actif', 'expire', 'suspendu', 'en_renouvellement') NOT NULL DEFAULT 'actif',
  `notes` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_titres_permis_operateur` (`operateur_id`),
  CONSTRAINT `fk_titres_permis_operateur` FOREIGN KEY (`operateur_id`) REFERENCES `tbl_operateurs_mines` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Titres et permis miniers';

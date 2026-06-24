-- Table zones + rattachements géographiques sur connaissements.
-- Prérequis : tbl_directions_provinciales, tbl_bureaux_internationaux.

CREATE TABLE IF NOT EXISTS `zones` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nom` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `statut` enum('Actif','Inactif') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Actif',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_zones_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `zones` (`code`, `nom`, `statut`) VALUES
  ('europe', 'Zone Europe', 'Actif'),
  ('asie', 'Zone Asie', 'Actif'),
  ('afrique', 'Zone Afrique', 'Actif'),
  ('moyenOrient', 'Zone Moyen-Orient', 'Actif');

ALTER TABLE `connaissements`
  ADD COLUMN `zone_connaissement` int NULL DEFAULT NULL AFTER `zone_nom`,
  ADD COLUMN `direction_connaissement` int NULL DEFAULT NULL AFTER `zone_connaissement`,
  ADD COLUMN `bureau_connaissement` int NULL DEFAULT NULL AFTER `direction_connaissement`;

ALTER TABLE `connaissements`
  ADD KEY `idx_connaissements_zone` (`zone_connaissement`),
  ADD KEY `idx_connaissements_direction` (`direction_connaissement`),
  ADD KEY `idx_connaissements_bureau` (`bureau_connaissement`);

ALTER TABLE `connaissements`
  ADD CONSTRAINT `fk_connaissements_zone` FOREIGN KEY (`zone_connaissement`) REFERENCES `zones` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_connaissements_direction` FOREIGN KEY (`direction_connaissement`) REFERENCES `tbl_directions_provinciales` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_connaissements_bureau` FOREIGN KEY (`bureau_connaissement`) REFERENCES `tbl_bureaux_internationaux` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

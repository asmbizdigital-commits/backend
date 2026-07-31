-- Liaisons Responsable Zone ↔ directions provinciales / bureaux internationaux.
CREATE TABLE IF NOT EXISTS `tbl_connexions_responsables` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `utilisateur_id` INT NOT NULL,
  `direction_provinciale_id` INT NULL DEFAULT NULL,
  `bureau_international_id` INT NULL DEFAULT NULL,
  `created_by` INT NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_connexions_resp_user_direction` (`utilisateur_id`, `direction_provinciale_id`),
  UNIQUE KEY `uk_connexions_resp_user_bureau` (`utilisateur_id`, `bureau_international_id`),
  KEY `idx_connexions_resp_utilisateur` (`utilisateur_id`),
  KEY `idx_connexions_resp_direction` (`direction_provinciale_id`),
  KEY `idx_connexions_resp_bureau` (`bureau_international_id`),
  KEY `idx_connexions_resp_created_by` (`created_by`),
  CONSTRAINT `fk_connexions_resp_utilisateur`
    FOREIGN KEY (`utilisateur_id`) REFERENCES `tbl_utilisateurs` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_connexions_resp_direction`
    FOREIGN KEY (`direction_provinciale_id`) REFERENCES `tbl_directions_provinciales` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_connexions_resp_bureau`
    FOREIGN KEY (`bureau_international_id`) REFERENCES `tbl_bureaux_internationaux` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_connexions_resp_created_by`
    FOREIGN KEY (`created_by`) REFERENCES `tbl_utilisateurs` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

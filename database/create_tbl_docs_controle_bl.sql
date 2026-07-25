-- Pièces jointes du contrôle Sygrem (max 5 par connaissement, appliqué côté API).
CREATE TABLE IF NOT EXISTS `tbl_docs_controle_bl` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `connaissement_id` INT NOT NULL,
  `file_url` VARCHAR(1000) NOT NULL,
  `cloudinary_public_id` VARCHAR(255) NULL,
  `original_filename` VARCHAR(255) NULL,
  `mime_type` VARCHAR(120) NULL,
  `uploaded_by` INT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_docs_controle_bl_connaissement` (`connaissement_id`),
  KEY `idx_docs_controle_bl_uploaded_by` (`uploaded_by`),
  CONSTRAINT `fk_docs_controle_bl_connaissement`
    FOREIGN KEY (`connaissement_id`) REFERENCES `connaissements` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_docs_controle_bl_user`
    FOREIGN KEY (`uploaded_by`) REFERENCES `tbl_utilisateurs` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

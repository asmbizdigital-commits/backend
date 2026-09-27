-- Dossiers (connaissements) liés à une réunion Teams

CREATE TABLE IF NOT EXISTS `tbl_teams_meeting_dossiers` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `meeting_id` INT NOT NULL,
  `connaissement_id` INT NOT NULL,
  `label` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_teams_meeting_dossier` (`meeting_id`, `connaissement_id`),
  KEY `idx_teams_md_meeting` (`meeting_id`),
  KEY `idx_teams_md_conn` (`connaissement_id`),
  CONSTRAINT `fk_teams_md_meeting`
    FOREIGN KEY (`meeting_id`) REFERENCES `tbl_teams_meetings` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

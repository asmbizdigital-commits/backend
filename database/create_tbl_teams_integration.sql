-- Microsoft Teams integration — comptes + réunions + participants
-- FK vers tbl_utilisateurs (ASM-PADS)

CREATE TABLE IF NOT EXISTS `tbl_teams_accounts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `microsoft_user_id` VARCHAR(255) NOT NULL,
  `microsoft_email` VARCHAR(255) DEFAULT NULL,
  `display_name` VARCHAR(255) DEFAULT NULL,
  `tenant_id` VARCHAR(255) DEFAULT NULL,
  `access_token_enc` TEXT,
  `refresh_token_enc` TEXT,
  `token_expires_at` DATETIME DEFAULT NULL,
  `scopes` TEXT,
  `connected_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_teams_accounts_user` (`user_id`),
  UNIQUE KEY `uk_teams_accounts_ms_user` (`microsoft_user_id`),
  KEY `idx_teams_accounts_email` (`microsoft_email`),
  CONSTRAINT `fk_teams_accounts_user`
    FOREIGN KEY (`user_id`) REFERENCES `tbl_utilisateurs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tbl_teams_meetings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `created_by` INT NOT NULL,
  `microsoft_event_id` VARCHAR(500) DEFAULT NULL,
  `microsoft_meeting_id` VARCHAR(500) DEFAULT NULL,
  `subject` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `start_at` DATETIME NOT NULL,
  `end_at` DATETIME NOT NULL,
  `timezone` VARCHAR(100) DEFAULT 'Africa/Kinshasa',
  `join_url` TEXT,
  `reference_type` VARCHAR(100) DEFAULT NULL,
  `reference_id` INT DEFAULT NULL,
  `status` ENUM('scheduled','started','completed','cancelled') NOT NULL DEFAULT 'scheduled',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_teams_meetings_created_by` (`created_by`),
  KEY `idx_teams_meetings_start` (`start_at`),
  KEY `idx_teams_meetings_ref` (`reference_type`, `reference_id`),
  KEY `idx_teams_meetings_status` (`status`),
  CONSTRAINT `fk_teams_meetings_user`
    FOREIGN KEY (`created_by`) REFERENCES `tbl_utilisateurs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tbl_teams_meeting_participants` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `meeting_id` INT NOT NULL,
  `user_id` INT DEFAULT NULL,
  `email` VARCHAR(255) NOT NULL,
  `display_name` VARCHAR(255) DEFAULT NULL,
  `participant_type` ENUM('required','optional','organizer') NOT NULL DEFAULT 'required',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_teams_parts_meeting` (`meeting_id`),
  KEY `idx_teams_parts_user` (`user_id`),
  CONSTRAINT `fk_teams_parts_meeting`
    FOREIGN KEY (`meeting_id`) REFERENCES `tbl_teams_meetings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_teams_parts_user`
    FOREIGN KEY (`user_id`) REFERENCES `tbl_utilisateurs` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

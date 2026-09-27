-- Tâches TaskPro liées à une réunion Teams

CREATE TABLE IF NOT EXISTS `tbl_teams_meeting_tasks` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `meeting_id` INT DEFAULT NULL,
  `join_url` TEXT DEFAULT NULL,
  `task_pro_id` INT NOT NULL,
  `created_by` INT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_teams_meeting_task` (`meeting_id`, `task_pro_id`),
  KEY `idx_teams_mt_meeting` (`meeting_id`),
  KEY `idx_teams_mt_task` (`task_pro_id`),
  KEY `idx_teams_mt_join` (`join_url`(255)),
  KEY `idx_teams_mt_created_by` (`created_by`),
  CONSTRAINT `fk_teams_mt_meeting`
    FOREIGN KEY (`meeting_id`) REFERENCES `tbl_teams_meetings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_teams_mt_task`
    FOREIGN KEY (`task_pro_id`) REFERENCES `tbl_task_pro` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_teams_mt_user`
    FOREIGN KEY (`created_by`) REFERENCES `tbl_utilisateurs` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

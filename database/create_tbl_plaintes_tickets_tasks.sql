-- Table de liaison plainte / ticket pro / tâche TASKPRO

CREATE TABLE IF NOT EXISTS `tbl_plaintes_tickets_tasks` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `plainte_id` INT(11) NOT NULL COMMENT 'Référence plainte',
  `ticket_pro_id` INT(11) NOT NULL COMMENT 'Référence ticket pro',
  `task_pro_id` INT(11) NOT NULL COMMENT 'Référence tâche TASKPRO',
  `createur_id` INT(11) DEFAULT NULL COMMENT 'Utilisateur ayant créé la liaison',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_plaintes_tickets_tasks_ticket` (`ticket_pro_id`),
  UNIQUE KEY `uk_plaintes_tickets_tasks_task` (`task_pro_id`),
  KEY `idx_ptt_plainte` (`plainte_id`),
  CONSTRAINT `fk_ptt_plainte` FOREIGN KEY (`plainte_id`) REFERENCES `tbl_plaintes` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_ptt_ticket` FOREIGN KEY (`ticket_pro_id`) REFERENCES `tbl_tickets_pro` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_ptt_task` FOREIGN KEY (`task_pro_id`) REFERENCES `tbl_task_pro` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_ptt_createur` FOREIGN KEY (`createur_id`) REFERENCES `tbl_utilisateurs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Liaison plainte, ticket pro et tâche TASKPRO';

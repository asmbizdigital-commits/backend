-- Assignation B/L pour le contrôle (Verificateur Sygrem), miroir de tbl_assignations_bl.
CREATE TABLE IF NOT EXISTS `tbl_assignation_bl_controleur` (
  `id` int NOT NULL AUTO_INCREMENT,
  `connaissement_id` int NOT NULL,
  `assignee_id` int NOT NULL,
  `role_cible` enum('Verificateur Sygrem') NOT NULL DEFAULT 'Verificateur Sygrem',
  `priorite` enum('Normale','Haute','Urgente') NOT NULL DEFAULT 'Normale',
  `date_limite` date DEFAULT NULL,
  `commentaire` text,
  `statut` enum('Assignée','En cours','Terminée','Annulée') NOT NULL DEFAULT 'Assignée',
  `task_pro_id` int DEFAULT NULL,
  `assigne_par_id` int NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_assign_bl_ctrl_connaissement_id` (`connaissement_id`),
  KEY `idx_assign_bl_ctrl_assignee_id` (`assignee_id`),
  KEY `idx_assign_bl_ctrl_statut` (`statut`),
  KEY `idx_assign_bl_ctrl_task_pro_id` (`task_pro_id`),
  CONSTRAINT `fk_assign_bl_ctrl_connaissement` FOREIGN KEY (`connaissement_id`) REFERENCES `connaissements` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_assign_bl_ctrl_assignee` FOREIGN KEY (`assignee_id`) REFERENCES `tbl_utilisateurs` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_assign_bl_ctrl_task_pro` FOREIGN KEY (`task_pro_id`) REFERENCES `tbl_task_pro` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_assign_bl_ctrl_assigne_par` FOREIGN KEY (`assigne_par_id`) REFERENCES `tbl_utilisateurs` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration pour créer la table tbl_task_pro
-- Table des tâches professionnelles avec gestion Kanban

CREATE TABLE IF NOT EXISTS `tbl_task_pro` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `numero_tache` VARCHAR(50) NOT NULL UNIQUE COMMENT 'Numéro unique de la tâche',
  `titre` VARCHAR(255) NOT NULL COMMENT 'Titre de la tâche',
  `description` TEXT DEFAULT NULL COMMENT 'Description détaillée de la tâche',
  `type_tache` ENUM('Tâche', 'Bug', 'Amélioration', 'Fonctionnalité', 'Documentation', 'Maintenance', 'Autre') NOT NULL DEFAULT 'Tâche' COMMENT 'Type de tâche',
  `statut` ENUM('À faire', 'En cours', 'En révision', 'Terminé', 'Bloqué', 'Annulé') NOT NULL DEFAULT 'À faire' COMMENT 'Statut de la tâche',
  `colonne_kanban` VARCHAR(50) NOT NULL DEFAULT 'À faire' COMMENT 'Colonne Kanban actuelle',
  `position` INT(11) NOT NULL DEFAULT 0 COMMENT 'Position dans la colonne Kanban',
  `priorite` ENUM('Basse', 'Normale', 'Haute', 'Urgente') NOT NULL DEFAULT 'Normale' COMMENT 'Priorité de la tâche',
  `urgence` ENUM('Faible', 'Moyenne', 'Élevée', 'Critique') DEFAULT 'Moyenne' COMMENT 'Niveau d\'urgence',
  
  -- Références utilisateurs
  `createur_id` INT(11) NOT NULL COMMENT 'ID du créateur de la tâche',
  `assignee_id` INT(11) DEFAULT NULL COMMENT 'ID de l\'assigné principal',
  `assignees` TEXT DEFAULT NULL COMMENT 'Liste des assignés (JSON)',
  `watchers` TEXT DEFAULT NULL COMMENT 'Liste des observateurs (JSON)',
  
  -- Références projet/liste
  `projet_id` INT(11) DEFAULT NULL COMMENT 'ID du projet',
  `projet_nom` VARCHAR(255) DEFAULT NULL COMMENT 'Nom du projet',
  `liste_id` INT(11) DEFAULT NULL COMMENT 'ID de la liste',
  `liste_nom` VARCHAR(255) DEFAULT NULL COMMENT 'Nom de la liste',
  
  -- Références départements
  `departement_id` INT(11) DEFAULT NULL COMMENT 'ID du département',
  `sous_departement_id` INT(11) DEFAULT NULL COMMENT 'ID du sous-département',
  
  -- Dates
  `date_creation` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Date de création',
  `date_debut` DATETIME DEFAULT NULL COMMENT 'Date de début prévue',
  `date_echeance` DATETIME DEFAULT NULL COMMENT 'Date d\'échéance',
  `date_debut_reelle` DATETIME DEFAULT NULL COMMENT 'Date de début réelle',
  `date_fin_reelle` DATETIME DEFAULT NULL COMMENT 'Date de fin réelle',
  `date_fermeture` DATETIME DEFAULT NULL COMMENT 'Date de fermeture',
  
  -- Estimations et temps
  `estimation_heures` DECIMAL(5,2) DEFAULT NULL COMMENT 'Estimation en heures',
  `temps_passe_heures` DECIMAL(5,2) NOT NULL DEFAULT 0 COMMENT 'Temps passé en heures',
  `progression` INT(11) NOT NULL DEFAULT 0 COMMENT 'Progression en pourcentage (0-100)',
  
  -- Métadonnées
  `labels` TEXT DEFAULT NULL COMMENT 'Labels associés (JSON)',
  `couleur` VARCHAR(7) DEFAULT NULL COMMENT 'Couleur de la tâche (hex)',
  `checklist` TEXT DEFAULT NULL COMMENT 'Checklist (JSON)',
  `dependances` TEXT DEFAULT NULL COMMENT 'Dépendances (JSON)',
  `sous_taches` TEXT DEFAULT NULL COMMENT 'Sous-tâches (JSON)',
  `tache_parent_id` INT(11) DEFAULT NULL COMMENT 'ID de la tâche parente',
  `fichiers_joints` TEXT DEFAULT NULL COMMENT 'Fichiers joints (JSON)',
  `liens` TEXT DEFAULT NULL COMMENT 'Liens associés (JSON)',
  `commentaires` TEXT DEFAULT NULL COMMENT 'Commentaires (JSON)',
  `notes_internes` TEXT DEFAULT NULL COMMENT 'Notes internes',
  `resolution` TEXT DEFAULT NULL COMMENT 'Résolution de la tâche',
  
  -- Compteurs
  `nombre_comments` INT(11) NOT NULL DEFAULT 0 COMMENT 'Nombre de commentaires',
  `nombre_attachments` INT(11) NOT NULL DEFAULT 0 COMMENT 'Nombre de pièces jointes',
  `nombre_checklist_items` INT(11) NOT NULL DEFAULT 0 COMMENT 'Nombre d\'éléments de checklist',
  `checklist_completed` INT(11) NOT NULL DEFAULT 0 COMMENT 'Nombre d\'éléments complétés',
  `vues` INT(11) NOT NULL DEFAULT 0 COMMENT 'Nombre de vues',
  `derniere_vue` DATETIME DEFAULT NULL COMMENT 'Date de dernière vue',
  
  -- Historique et activité
  `historique` TEXT DEFAULT NULL COMMENT 'Historique des modifications (JSON)',
  `activite` TEXT DEFAULT NULL COMMENT 'Activité récente (JSON)',
  
  -- Visibilité et confidentialité
  `visibilite` ENUM('Public', 'Privé', 'Équipe', 'Département') NOT NULL DEFAULT 'Public' COMMENT 'Niveau de visibilité',
  `confidentialite` ENUM('Normale', 'Confidentielle', 'Secrète') NOT NULL DEFAULT 'Normale' COMMENT 'Niveau de confidentialité',
  
  -- Récurrence
  `recurrence` ENUM('Aucune', 'Quotidienne', 'Hebdomadaire', 'Mensuelle', 'Annuelle', 'Personnalisée') NOT NULL DEFAULT 'Aucune' COMMENT 'Type de récurrence',
  `recurrence_config` TEXT DEFAULT NULL COMMENT 'Configuration de récurrence (JSON)',
  `tache_recurrente_id` INT(11) DEFAULT NULL COMMENT 'ID de la tâche récurrente parente',
  
  -- Rappels et notifications
  `rappel_actif` BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Rappel actif',
  `rappel_date` DATETIME DEFAULT NULL COMMENT 'Date du rappel',
  `notifications` TEXT DEFAULT NULL COMMENT 'Configuration des notifications (JSON)',
  
  -- Archivage et suppression
  `archive` BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Tâche archivée',
  `date_archivage` DATETIME DEFAULT NULL COMMENT 'Date d\'archivage',
  `supprime` BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Tâche supprimée',
  `date_suppression` DATETIME DEFAULT NULL COMMENT 'Date de suppression',
  
  -- Statistiques
  `temps_estime_total` DECIMAL(5,2) DEFAULT NULL COMMENT 'Temps estimé total',
  `temps_passe_total` DECIMAL(5,2) DEFAULT NULL COMMENT 'Temps passé total',
  `retard` INT(11) NOT NULL DEFAULT 0 COMMENT 'Retard en jours',
  `duree_jours` INT(11) DEFAULT NULL COMMENT 'Durée en jours',
  
  -- Champs personnalisés
  `custom_fields` TEXT DEFAULT NULL COMMENT 'Champs personnalisés (JSON)',
  `metadata` TEXT DEFAULT NULL COMMENT 'Métadonnées supplémentaires (JSON)',
  
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_numero_tache` (`numero_tache`),
  KEY `idx_statut` (`statut`),
  KEY `idx_colonne_kanban` (`colonne_kanban`),
  KEY `idx_priorite` (`priorite`),
  KEY `idx_type_tache` (`type_tache`),
  KEY `idx_createur_id` (`createur_id`),
  KEY `idx_assignee_id` (`assignee_id`),
  KEY `idx_projet_id` (`projet_id`),
  KEY `idx_liste_id` (`liste_id`),
  KEY `idx_departement_id` (`departement_id`),
  KEY `idx_date_echeance` (`date_echeance`),
  KEY `idx_tache_parent_id` (`tache_parent_id`),
  KEY `idx_archive` (`archive`),
  KEY `idx_supprime` (`supprime`),
  KEY `idx_colonne_position` (`colonne_kanban`, `position`),
  
  CONSTRAINT `fk_task_pro_createur` FOREIGN KEY (`createur_id`) REFERENCES `tbl_utilisateurs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_task_pro_assignee` FOREIGN KEY (`assignee_id`) REFERENCES `tbl_utilisateurs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_task_pro_departement` FOREIGN KEY (`departement_id`) REFERENCES `tbl_departements` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_task_pro_sous_departement` FOREIGN KEY (`sous_departement_id`) REFERENCES `tbl_sous_departements` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_task_pro_parent` FOREIGN KEY (`tache_parent_id`) REFERENCES `tbl_task_pro` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_task_pro_recurrente` FOREIGN KEY (`tache_recurrente_id`) REFERENCES `tbl_task_pro` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
  
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Table des tâches professionnelles avec gestion Kanban';


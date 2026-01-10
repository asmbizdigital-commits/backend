-- Migration pour créer la table tbl_plaintes
-- Table des plaintes (internes et externes)

CREATE TABLE IF NOT EXISTS `tbl_plaintes` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `numero_plainte` VARCHAR(50) NOT NULL UNIQUE COMMENT 'Numéro unique de la plainte',
  `type_plainte` ENUM('Interne', 'Externe') NOT NULL COMMENT 'Type de plainte',
  `titre` VARCHAR(255) NOT NULL COMMENT 'Titre de la plainte',
  `description` TEXT NOT NULL COMMENT 'Description détaillée de la plainte',
  `categorie` ENUM('Service', 'Qualité', 'Sécurité', 'Ressources Humaines', 'Financier', 'Technique', 'Autre') NOT NULL DEFAULT 'Autre' COMMENT 'Catégorie de la plainte',
  `priorite` ENUM('Basse', 'Normale', 'Haute', 'Urgente') NOT NULL DEFAULT 'Normale' COMMENT 'Priorité de la plainte',
  `statut` ENUM('Nouvelle', 'En cours', 'En attente', 'Résolue', 'Fermée', 'Rejetée') NOT NULL DEFAULT 'Nouvelle' COMMENT 'Statut de la plainte',
  
  -- Informations du plaignant (pour plaintes externes)
  `plaignant_nom` VARCHAR(255) DEFAULT NULL COMMENT 'Nom du plaignant (externe)',
  `plaignant_prenom` VARCHAR(255) DEFAULT NULL COMMENT 'Prénom du plaignant (externe)',
  `plaignant_email` VARCHAR(255) DEFAULT NULL COMMENT 'Email du plaignant (externe)',
  `plaignant_telephone` VARCHAR(20) DEFAULT NULL COMMENT 'Téléphone du plaignant (externe)',
  `plaignant_type` ENUM('Client', 'Visiteur', 'Fournisseur', 'Autre') DEFAULT NULL COMMENT 'Type de plaignant (externe)',
  
  -- Informations de l'employé plaignant (pour plaintes internes)
  `employe_id` INT(11) DEFAULT NULL COMMENT 'ID de l\'employé plaignant (interne)',
  
  -- Informations de traitement
  `departement_id` INT(11) DEFAULT NULL COMMENT 'ID du département concerné',
  `sous_departement_id` INT(11) DEFAULT NULL COMMENT 'ID du sous-département concerné',
  `chambre_id` INT(11) DEFAULT NULL COMMENT 'ID de la chambre concernée',
  `assignee_id` INT(11) DEFAULT NULL COMMENT 'ID de l\'utilisateur assigné au traitement',
  `rapporteur_id` INT(11) NOT NULL COMMENT 'ID de l\'utilisateur qui a rapporté la plainte',
  
  -- Dates importantes
  `date_incident` DATETIME DEFAULT NULL COMMENT 'Date de l\'incident',
  `date_creation` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Date de création de la plainte',
  `date_assignation` DATETIME DEFAULT NULL COMMENT 'Date d\'assignation',
  `date_resolution` DATETIME DEFAULT NULL COMMENT 'Date de résolution',
  `date_limite` DATETIME DEFAULT NULL COMMENT 'Date limite de traitement',
  `date_fermeture` DATETIME DEFAULT NULL COMMENT 'Date de fermeture',
  
  -- Informations de suivi
  `resolution` TEXT DEFAULT NULL COMMENT 'Description de la résolution',
  `actions_correctives` TEXT DEFAULT NULL COMMENT 'Actions correctives prises',
  `satisfaction_client` ENUM('Très satisfait', 'Satisfait', 'Neutre', 'Insatisfait', 'Très insatisfait') DEFAULT NULL COMMENT 'Niveau de satisfaction du client',
  `commentaire_satisfaction` TEXT DEFAULT NULL COMMENT 'Commentaire sur la satisfaction',
  
  -- Informations financières
  `montant_remboursement` DECIMAL(10,2) DEFAULT NULL COMMENT 'Montant de remboursement',
  `type_compensation` ENUM('Remboursement', 'Réduction', 'Service gratuit', 'Aucun') DEFAULT NULL COMMENT 'Type de compensation',
  
  -- Métadonnées
  `tags` TEXT DEFAULT NULL COMMENT 'Tags associés (JSON)',
  `fichiers_joints` TEXT DEFAULT NULL COMMENT 'Fichiers joints (JSON)',
  `notes_internes` TEXT DEFAULT NULL COMMENT 'Notes internes',
  `confidentialite` ENUM('Public', 'Interne', 'Confidentiel', 'Secret') NOT NULL DEFAULT 'Interne' COMMENT 'Niveau de confidentialité',
  
  -- Statistiques et suivi
  `duree_traitement_heures` INT(11) DEFAULT NULL COMMENT 'Durée de traitement en heures',
  `nombre_relances` INT(11) NOT NULL DEFAULT 0 COMMENT 'Nombre de relances',
  `derniere_relance` DATETIME DEFAULT NULL COMMENT 'Date de la dernière relance',
  
  -- Historique
  `historique_statut` TEXT DEFAULT NULL COMMENT 'Historique des changements de statut (JSON)',
  
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_numero_plainte` (`numero_plainte`),
  KEY `idx_type_plainte` (`type_plainte`),
  KEY `idx_statut` (`statut`),
  KEY `idx_priorite` (`priorite`),
  KEY `idx_categorie` (`categorie`),
  KEY `idx_employe_id` (`employe_id`),
  KEY `idx_assignee_id` (`assignee_id`),
  KEY `idx_rapporteur_id` (`rapporteur_id`),
  KEY `idx_departement_id` (`departement_id`),
  KEY `idx_chambre_id` (`chambre_id`),
  KEY `idx_date_creation` (`date_creation`),
  KEY `idx_date_incident` (`date_incident`),
  KEY `idx_plaignant_email` (`plaignant_email`),
  
  CONSTRAINT `fk_plaintes_employe` FOREIGN KEY (`employe_id`) REFERENCES `tbl_utilisateurs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_plaintes_assignee` FOREIGN KEY (`assignee_id`) REFERENCES `tbl_utilisateurs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_plaintes_rapporteur` FOREIGN KEY (`rapporteur_id`) REFERENCES `tbl_utilisateurs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_plaintes_departement` FOREIGN KEY (`departement_id`) REFERENCES `tbl_departements` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_plaintes_sous_departement` FOREIGN KEY (`sous_departement_id`) REFERENCES `tbl_sous_departements` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_plaintes_chambre` FOREIGN KEY (`chambre_id`) REFERENCES `tbl_chambres` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
  
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Table des plaintes (internes et externes)';


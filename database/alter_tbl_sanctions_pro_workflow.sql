-- Circuit de sanctions disciplinaires : nouveaux statuts et colonnes d'étapes
-- Workflow: Signalement → Analyse RH → Convocation → Entretien → Décision → Notification → Archivage

-- 1. Étendre l'ENUM statut (MySQL: MODIFY pour ajouter des valeurs)
ALTER TABLE tbl_sanctions_pro
  MODIFY COLUMN statut ENUM(
    'en_attente',
    'approuve',
    'rejete',
    'annule',
    'en_analyse_rh',
    'classement_sans_suite',
    'convocation_envoyee',
    'entretien_realise',
    'sanction_validee',
    'sanction_notifiee',
    'dossier_cloture'
  ) NOT NULL DEFAULT 'en_attente' COMMENT 'Statut dans le circuit disciplinaire';

-- 2. Colonnes pour les étapes du circuit
ALTER TABLE tbl_sanctions_pro
  ADD COLUMN date_convocation DATE NULL COMMENT 'Date d\'envoi de la convocation à entretien' AFTER commentaire_rh,
  ADD COLUMN date_entretien DATE NULL COMMENT 'Date de l\'entretien disciplinaire' AFTER date_convocation,
  ADD COLUMN date_decision DATE NULL COMMENT 'Date de la décision de sanction' AFTER date_entretien,
  ADD COLUMN date_notification DATE NULL COMMENT 'Date de notification officielle' AFTER date_decision,
  ADD COLUMN date_cloture DATE NULL COMMENT 'Date de clôture du dossier' AFTER date_notification,
  ADD COLUMN niveau_gravite ENUM('leger','moyen','grave','tres_grave') NULL COMMENT 'Niveau de gravité (pour recommandation sanction)' AFTER date_cloture,
  ADD COLUMN validation_direction_id INT(11) NULL COMMENT 'ID utilisateur Direction si faute grave' AFTER niveau_gravite;

-- 3. Clé étrangère pour validation direction (optionnel)
ALTER TABLE tbl_sanctions_pro
  ADD CONSTRAINT fk_sanctions_pro_validation_direction
  FOREIGN KEY (validation_direction_id) REFERENCES tbl_utilisateurs(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Index pour validation_direction_id (optionnel, si pas déjà couvert)
-- CREATE INDEX idx_sanctions_pro_validation_direction ON tbl_sanctions_pro(validation_direction_id);

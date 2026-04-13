-- Champs d’annotation du contrôleur Sygram sur bl_documents
ALTER TABLE `bl_documents`
  ADD COLUMN `annotation_controlleur` TEXT NULL DEFAULT NULL AFTER `is_validated`,
  ADD COLUMN `datetime_annotation` DATETIME NULL DEFAULT NULL AFTER `annotation_controlleur`,
  ADD COLUMN `is_controlled_by_controller` TINYINT(1) NOT NULL DEFAULT 0 AFTER `datetime_annotation`;

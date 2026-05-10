-- Référence les assignations sur `connaissements.id` (INT) au lieu de `bl_documents.id` (UUID).
-- DESTRUCTIF : supprime les lignes d’assignation existantes (UUID incompatibles avec INT).
-- Prérequis : table `connaissements` existante (`npm run migrate:asmproclient` ou équivalent).

SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM `tbl_assignation_bl_controleur`;
DELETE FROM `tbl_assignations_bl`;

ALTER TABLE `tbl_assignations_bl` DROP FOREIGN KEY `fk_assignations_bl_document`;
ALTER TABLE `tbl_assignations_bl` DROP INDEX `idx_assignations_bl_bl_document_id`;
ALTER TABLE `tbl_assignations_bl` CHANGE COLUMN `bl_document_id` `connaissement_id` int NOT NULL;
ALTER TABLE `tbl_assignations_bl` ADD KEY `idx_assignations_bl_connaissement_id` (`connaissement_id`);
ALTER TABLE `tbl_assignations_bl`
  ADD CONSTRAINT `fk_assignations_bl_connaissement`
  FOREIGN KEY (`connaissement_id`) REFERENCES `connaissements` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `tbl_assignation_bl_controleur` DROP FOREIGN KEY `fk_assign_bl_ctrl_document`;
ALTER TABLE `tbl_assignation_bl_controleur` DROP INDEX `idx_assign_bl_ctrl_bl_document_id`;
ALTER TABLE `tbl_assignation_bl_controleur` CHANGE COLUMN `bl_document_id` `connaissement_id` int NOT NULL;
ALTER TABLE `tbl_assignation_bl_controleur` ADD KEY `idx_assign_bl_ctrl_connaissement_id` (`connaissement_id`);
ALTER TABLE `tbl_assignation_bl_controleur`
  ADD CONSTRAINT `fk_assign_bl_ctrl_connaissement`
  FOREIGN KEY (`connaissement_id`) REFERENCES `connaissements` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

SET FOREIGN_KEY_CHECKS = 1;

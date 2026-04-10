ALTER TABLE `bl_documents`
  ADD COLUMN `is_exported` TINYINT(1) NOT NULL DEFAULT 0 AFTER `declaration_number`;

ALTER TABLE `bl_documents`
  ADD COLUMN `is_declared` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_exported`;

ALTER TABLE `bl_documents`
  ADD COLUMN `is_validated` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_declared`;

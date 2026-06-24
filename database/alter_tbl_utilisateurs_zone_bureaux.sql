-- Zone géographique + rattachements direction provinciale / bureau international (optionnels).
ALTER TABLE `tbl_utilisateurs`
  ADD COLUMN `zone` VARCHAR(30) NULL DEFAULT NULL AFTER `sous_departement_id`,
  ADD COLUMN `direction_provinciale_id` INT NULL DEFAULT NULL AFTER `zone`,
  ADD COLUMN `bureau_international_id` INT NULL DEFAULT NULL AFTER `direction_provinciale_id`;

ALTER TABLE `tbl_utilisateurs`
  ADD KEY `idx_utilisateurs_direction_provinciale` (`direction_provinciale_id`),
  ADD KEY `idx_utilisateurs_bureau_international` (`bureau_international_id`);

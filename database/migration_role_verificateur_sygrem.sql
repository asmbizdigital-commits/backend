-- Renomme uniquement Contrôleur Sygram (accent ô) → Verificateur Sygrem.
-- Controlleur Sygram (sans accent) reste un rôle distinct.
-- Préférer en production : npm run migrate:role-verificateur-sygrem

UPDATE `tbl_utilisateurs`
SET `role` = 'Verificateur Sygrem'
WHERE `role` = 'Contrôleur Sygram';

UPDATE `tbl_assignation_bl_controleur`
SET `role_cible` = 'Verificateur Sygrem'
WHERE `role_cible` = 'Contrôleur Sygram';

-- ENUM role_cible (table assignations contrôle)
ALTER TABLE `tbl_assignation_bl_controleur`
  MODIFY COLUMN `role_cible` ENUM('Verificateur Sygrem') NOT NULL DEFAULT 'Verificateur Sygrem';

-- ENUM role utilisateurs : voir scripts/run-migrate-role-verificateur-sygrem.js

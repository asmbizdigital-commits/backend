-- N° B/L réels (CMR-…, HLCUSZ…) dépassent souvent varchar(20).
-- Exécuter sur la BDD prod avant / avec le déploiement du PATCH fiche-detail.

ALTER TABLE `connaissements`
  MODIFY COLUMN `bl_number` VARCHAR(64) NOT NULL;

-- Colonnes support client (call center) sur connaissements.
-- Déjà présentes en production ; script idempotent pour aligner les environnements locaux.

ALTER TABLE `connaissements`
  ADD COLUMN IF NOT EXISTS `id_support_client` int DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `nom_support_client` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL;

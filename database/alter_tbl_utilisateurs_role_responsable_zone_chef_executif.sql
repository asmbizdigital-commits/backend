-- Ajoute les rôles « Responsable Zone » et « Chef Exécutif des Opérations »
-- sur tbl_utilisateurs.role.
-- Avant exécution : SHOW COLUMNS FROM tbl_utilisateurs LIKE 'role';
-- En production, préférer :
--   node backend/scripts/run-migrate-user-role-responsable-zone-chef-executif.js

ALTER TABLE `tbl_utilisateurs` MODIFY COLUMN `role` ENUM(
  'Agent',
  'Agent Chambre',
  'Agent Exterieur',
  'Agent Gouvernant',
  'Administrateur',
  'Auditeur',
  'Booker',
  'call_center',
  'Chef Exécutif des Opérations',
  'Controlleur Sygram',
  'Directeur Opérations',
  'Directeur Operations',
  'Gestionnaire des Plaintes',
  'Guichetier',
  'Manager Bureau',
  'Patron',
  'Responsable Zone',
  'Saisisseur',
  'Superviseur',
  'Superviseur Buanderie',
  'Superviseur Comptable',
  'Superviseur Finance',
  'Superviseur Housing',
  'Superviseur RH',
  'Superviseur Resto',
  'Superviseur Stock',
  'Superviseur Technique',
  'Verificateur Sygrem',
  'Web Master'
) NOT NULL DEFAULT 'Agent';

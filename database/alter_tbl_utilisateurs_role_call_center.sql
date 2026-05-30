-- Ajoute le profil utilisateur call_center (call center).
-- Avant exécution : SHOW COLUMNS FROM tbl_utilisateurs LIKE 'role';
-- Fusionner avec les valeurs déjà présentes en production si la liste diffère.

ALTER TABLE `tbl_utilisateurs` MODIFY COLUMN `role` ENUM(
  'Agent',
  'Agent Chambre',
  'Agent Exterieur',
  'Agent Gouvernant',
  'Administrateur',
  'Auditeur',
  'Booker',
  'call_center',
  'Verificateur Sygrem',
  'Gestionnaire des Plaintes',
  'Directeur Opérations',
  'Directeur Operations',
  'Guichetier',
  'Patron',
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
  'Web Master'
) NOT NULL DEFAULT 'Agent';

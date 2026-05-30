-- Étend l'ENUM `role` : Saisisseur, Verificateur Sygrem.
-- Avant exécution : SHOW COLUMNS FROM tbl_utilisateurs LIKE 'role';
-- Si d'autres valeurs existent déjà en production, ajoutez-les à cette liste (MySQL exige toutes les valeurs à chaque MODIFY).

ALTER TABLE `tbl_utilisateurs` MODIFY COLUMN `role` ENUM(
  'Agent',
  'Agent Chambre',
  'Agent Exterieur',
  'Agent Gouvernant',
  'Administrateur',
  'Auditeur',
  'Booker',
  'Verificateur Sygrem',
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

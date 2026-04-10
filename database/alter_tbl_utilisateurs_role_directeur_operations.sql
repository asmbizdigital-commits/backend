-- Ajoute le rôle « Directeur Opérations » (assignation contrôle B/L réservée Admin + ce rôle).
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
  'Contrôleur Sygram',
  'Directeur Opérations',
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

-- Table principale des soumissions de besoins (jonction bon de prélèvement / demande de fonds)
CREATE TABLE IF NOT EXISTS tbl_soumissions_besoins (
  id INT NOT NULL AUTO_INCREMENT,
  type ENUM('materiel', 'fonds') NOT NULL COMMENT 'Besoin en matériel ou en fonds',
  demandeur_id INT NOT NULL,
  superviseur_id INT NOT NULL COMMENT 'Superviseur ciblé (Superviseur, Superviseur RH, Superviseur Technique, Superviseur Stock)',
  statut ENUM('en_attente', 'approuvee', 'rejetee', 'annulee') NOT NULL DEFAULT 'en_attente',
  motif TEXT,
  commentaire TEXT,
  montant_total DECIMAL(14, 2) NULL COMMENT 'Pour type fonds uniquement',
  devise ENUM('EUR', 'USD', 'FC') NULL DEFAULT 'FC',
  commentaire_superviseur TEXT,
  date_validation DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_soumissions_besoins_demandeur (demandeur_id),
  KEY idx_soumissions_besoins_superviseur (superviseur_id),
  KEY idx_soumissions_besoins_statut (statut),
  KEY idx_soumissions_besoins_type (type),
  CONSTRAINT fk_soumissions_besoins_demandeur FOREIGN KEY (demandeur_id) REFERENCES tbl_utilisateurs (id) ON DELETE CASCADE,
  CONSTRAINT fk_soumissions_besoins_superviseur FOREIGN KEY (superviseur_id) REFERENCES tbl_utilisateurs (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des lignes (matériel : inventaire + département + qté ; fonds : libellé + montant ou article)
CREATE TABLE IF NOT EXISTS tbl_soumissions_besoins_lignes (
  id INT NOT NULL AUTO_INCREMENT,
  soumission_besoins_id INT NOT NULL,
  type_ligne ENUM('article', 'libelle') NOT NULL DEFAULT 'libelle',
  inventaire_id INT NULL,
  departement_id INT NULL,
  libelle VARCHAR(255) NULL,
  montant DECIMAL(14, 2) NULL,
  quantite INT NULL DEFAULT 1,
  prix_unitaire DECIMAL(14, 2) NULL,
  devise ENUM('EUR', 'USD', 'FC') NULL DEFAULT 'FC',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sb_lignes_soumission (soumission_besoins_id),
  CONSTRAINT fk_sb_lignes_soumission FOREIGN KEY (soumission_besoins_id) REFERENCES tbl_soumissions_besoins (id) ON DELETE CASCADE,
  CONSTRAINT fk_sb_lignes_inventaire FOREIGN KEY (inventaire_id) REFERENCES tbl_inventaire (id) ON DELETE SET NULL,
  CONSTRAINT fk_sb_lignes_departement FOREIGN KEY (departement_id) REFERENCES tbl_departements (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

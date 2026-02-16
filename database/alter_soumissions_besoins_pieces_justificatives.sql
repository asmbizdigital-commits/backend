-- Pièces justificatives (3 max) pour les soumissions de besoins — URLs Cloudinary + noms originaux
-- Exécuter chaque ALTER séparément si votre MySQL ne supporte pas plusieurs ADD COLUMN en une fois.
ALTER TABLE tbl_soumissions_besoins ADD COLUMN piece_justificative_1_url VARCHAR(512) NULL;
ALTER TABLE tbl_soumissions_besoins ADD COLUMN piece_justificative_1_nom VARCHAR(255) NULL;
ALTER TABLE tbl_soumissions_besoins ADD COLUMN piece_justificative_2_url VARCHAR(512) NULL;
ALTER TABLE tbl_soumissions_besoins ADD COLUMN piece_justificative_2_nom VARCHAR(255) NULL;
ALTER TABLE tbl_soumissions_besoins ADD COLUMN piece_justificative_3_url VARCHAR(512) NULL;
ALTER TABLE tbl_soumissions_besoins ADD COLUMN piece_justificative_3_nom VARCHAR(255) NULL;

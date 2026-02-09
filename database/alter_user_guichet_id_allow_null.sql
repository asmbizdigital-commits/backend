-- Rendre user_guichet_id optionnel (nullable) dans tbl_encaissements
ALTER TABLE tbl_encaissements MODIFY COLUMN user_guichet_id INT NULL;

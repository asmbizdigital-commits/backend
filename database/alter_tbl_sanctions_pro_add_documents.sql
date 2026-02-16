-- Pièces justificatives (3 max) pour les demandes de sanctions — stockage JSON { piece_1: { url, nom }, piece_2, piece_3 }
-- Exécuter une seule fois. Si la colonne documents existe déjà (créée par le modèle Sequelize), ignorer l'erreur ou ne pas exécuter.
ALTER TABLE tbl_sanctions_pro ADD COLUMN documents JSON NULL COMMENT 'Pièces justificatives (piece_1, piece_2, piece_3: { url, nom })';

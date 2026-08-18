-- Index recommandés pour réduire la charge API (monitoring, connaissements, activité dossiers)
-- Exécuter une fois en production après revue des noms de tables.

CREATE INDEX IF NOT EXISTS idx_dossier_activity_created
  ON tbl_dossier_activity_log (created_at);

CREATE INDEX IF NOT EXISTS idx_dossier_activity_conn_created
  ON tbl_dossier_activity_log (connaissement_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_connaissements_created
  ON connaissements (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_docs_douaniers_conn
  ON documents_douaniers (connaissement_id);

CREATE INDEX IF NOT EXISTS idx_docs_feri_conn
  ON tbl_docs_feri (doc_connaissement_id);

CREATE INDEX IF NOT EXISTS idx_docs_zip_conn
  ON tbl_docs_zip (doc_connaissement_id);

CREATE INDEX IF NOT EXISTS idx_assign_bl_controleur_conn
  ON tbl_assignations_bl_controleur (connaissement_id, statut);

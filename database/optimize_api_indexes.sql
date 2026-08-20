-- Index API — idempotent (exécuter via npm run migrate:optimize-api-indexes)
-- Compatible MySQL 5.7 / 8 : le script JS vérifie information_schema avant CREATE.
-- Ne pas lancer migrate:asmproclient (DROP TABLE).

-- 1) connaissements.created_at (liste GET /api/connaissements ORDER BY created_at DESC)
-- 2) tbl_dossier_activity_log (connaissement_id, created_at) pour last-event + /today
-- 3) tbl_docs_feri.doc_connaissement_id (GET docs-feri)
-- 4) tbl_assignation_bl_controleur (connaissement_id, statut) — table réelle SANS « s »

-- Les index suivants existent déjà dans les CREATE TABLE et sont volontairement omis :
--   idx_dal_created, idx_connaissement_id (documents_douaniers),
--   uq_docs_zip_connaissement, idx_assign_bl_ctrl_connaissement_id

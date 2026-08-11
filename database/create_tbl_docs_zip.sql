-- Archives ZIP liées à un connaissement.
CREATE TABLE IF NOT EXISTS `tbl_docs_zip` (
  `id` int NOT NULL AUTO_INCREMENT,
  `doc_connaissement_id` int NOT NULL,
  `file_url` varchar(1000) NOT NULL,
  `cloudinary_public_id` varchar(255) DEFAULT NULL,
  `original_filename` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_docs_zip_connaissement` (`doc_connaissement_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

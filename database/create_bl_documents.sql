-- Crée la table bl_documents (documents B/L extraits), sans données.
-- Même définition que bl_documents_202604061200.sql à la racine du projet.

CREATE TABLE IF NOT EXISTS `bl_documents` (
  `id` varchar(36) NOT NULL,
  `file_name` varchar(512) NOT NULL,
  `file_hash` varchar(64) NOT NULL,
  `bl_number` varchar(64) DEFAULT NULL,
  `booking_number` varchar(64) DEFAULT NULL,
  `vessel` varchar(255) DEFAULT NULL,
  `port_loading` varchar(255) DEFAULT NULL,
  `port_discharge` varchar(255) DEFAULT NULL,
  `weight` varchar(64) DEFAULT NULL,
  `raw_text` longtext,
  `status` varchar(32) NOT NULL DEFAULT 'pending',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `shipper` text,
  `consignee` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bl_documents_file_hash` (`file_hash`),
  KEY `idx_bl_documents_bl_number` (`bl_number`),
  KEY `idx_bl_documents_status_created` (`status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

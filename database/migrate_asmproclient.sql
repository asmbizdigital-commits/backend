-- MySQL dump 10.13  Distrib 9.4.0, for macos15.4 (arm64)
--
-- Host: localhost    Database: extractionappdb
-- ------------------------------------------------------
-- Server version	9.4.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

DROP VIEW IF EXISTS `vue_facture_detaillee`;
DROP VIEW IF EXISTS `vue_connaissement_complet`;

--
-- Table structure for table `articles_attributes`
--

DROP TABLE IF EXISTS `articles_attributes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `articles_attributes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `article_id` int NOT NULL,
  `attribute_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ex: model, machine_no, chassis_no, color, size, brand, etc.',
  `attribute_value` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_article_attribute` (`article_id`,`attribute_name`),
  KEY `idx_article_id` (`article_id`),
  KEY `idx_attribute_name` (`attribute_name`),
  CONSTRAINT `articles_attributes_ibfk_1` FOREIGN KEY (`article_id`) REFERENCES `articles_facture` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `articles_facture`
--

DROP TABLE IF EXISTS `articles_facture`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `articles_facture` (
  `id` int NOT NULL AUTO_INCREMENT,
  `facture_id` int NOT NULL,
  `line_number` int NOT NULL COMMENT 'Numéro de ligne dans la facture',
  `quantity` int DEFAULT '1',
  `unit_price` decimal(12,2) DEFAULT NULL,
  `total_price` decimal(12,2) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_facture_id` (`facture_id`),
  KEY `idx_line_number` (`line_number`),
  CONSTRAINT `articles_facture_ibfk_1` FOREIGN KEY (`facture_id`) REFERENCES `factures_commerciales` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `connaissements`
--

DROP TABLE IF EXISTS `connaissements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `connaissements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `bl_number` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `carrier` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `shipper_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `shipper_address` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `consignee_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `consignee_address` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `vessel_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `voyage_number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `port_of_loading` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `port_of_discharge` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `place_of_delivery` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `goods_description` text COLLATE utf8mb4_unicode_ci,
  `total_packages` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `total_weight_kg` decimal(12,2) DEFAULT NULL,
  `eta` datetime DEFAULT NULL,
  `total_measurement_cbm` decimal(10,2) DEFAULT NULL,
  `hs_code_indicated` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `client_nom` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `zone_nom` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_email` timestamp NULL DEFAULT NULL,
  `adresse_mail` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `numero_dossier` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `numero_fxi` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_emission` date DEFAULT NULL,
  `validation_fxi` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_validation_fxi` date DEFAULT NULL,
  `controle_par_id` int DEFAULT NULL,
  `controle_par` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_controle` datetime DEFAULT NULL,
  `declaration_number` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_exported` tinyint(1) NOT NULL DEFAULT '0',
  `is_declared` tinyint(1) NOT NULL DEFAULT '0',
  `is_validated` tinyint(1) NOT NULL DEFAULT '0',
  `annotation_controlleur` text COLLATE utf8mb4_unicode_ci,
  `datetime_annotation` datetime DEFAULT NULL,
  `is_controlled_by_controller` tinyint(1) NOT NULL DEFAULT '0',
  `numero_feri` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `bl_number` (`bl_number`),
  KEY `idx_bl_number` (`bl_number`),
  KEY `idx_carrier` (`carrier`),
  KEY `idx_vessel_name` (`vessel_name`),
  KEY `idx_port_of_loading` (`port_of_loading`),
  KEY `idx_port_of_discharge` (`port_of_discharge`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `conteneurs`
--

DROP TABLE IF EXISTS `conteneurs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conteneurs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `connaissement_id` int NOT NULL,
  `container_number` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `seal_number` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `type` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `weight_kg` decimal(12,2) DEFAULT NULL,
  `measurement_cbm` decimal(10,2) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_container_number` (`container_number`),
  KEY `idx_container_number` (`container_number`),
  KEY `idx_connaissement_id` (`connaissement_id`),
  CONSTRAINT `conteneurs_ibfk_1` FOREIGN KEY (`connaissement_id`) REFERENCES `connaissements` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `documents_douaniers`
--

DROP TABLE IF EXISTS `documents_douaniers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `documents_douaniers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `connaissement_id` int NOT NULL,
  `feri_number` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `feri_validation_date` date DEFAULT NULL,
  `bv_number` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_connaissement_id` (`connaissement_id`),
  KEY `idx_feri_number` (`feri_number`),
  KEY `idx_bv_number` (`bv_number`),
  KEY `idx_connaissement_id` (`connaissement_id`),
  CONSTRAINT `documents_douaniers_ibfk_1` FOREIGN KEY (`connaissement_id`) REFERENCES `connaissements` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `factures_commerciales`
--

DROP TABLE IF EXISTS `factures_commerciales`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `factures_commerciales` (
  `id` int NOT NULL AUTO_INCREMENT,
  `connaissement_id` int NOT NULL,
  `invoice_number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `invoice_date` date NOT NULL,
  `contract_number` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `currency` varchar(3) COLLATE utf8mb4_unicode_ci DEFAULT 'USD',
  `fob_value` decimal(12,2) DEFAULT NULL,
  `ocean_freight` decimal(12,2) DEFAULT NULL,
  `insurance` decimal(12,2) DEFAULT NULL,
  `total_cip_value` decimal(12,2) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_invoice_number` (`invoice_number`),
  KEY `idx_invoice_number` (`invoice_number`),
  KEY `idx_connaissement_id` (`connaissement_id`),
  KEY `idx_invoice_date` (`invoice_date`),
  CONSTRAINT `factures_commerciales_ibfk_1` FOREIGN KEY (`connaissement_id`) REFERENCES `connaissements` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `infos_bancaires`
--

DROP TABLE IF EXISTS `infos_bancaires`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `infos_bancaires` (
  `id` int NOT NULL AUTO_INCREMENT,
  `facture_id` int NOT NULL,
  `beneficiary` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bank_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `swift_code` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `account_number` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_facture_id` (`facture_id`),
  KEY `idx_facture_id` (`facture_id`),
  KEY `idx_swift_code` (`swift_code`),
  KEY `idx_beneficiary` (`beneficiary`),
  CONSTRAINT `infos_bancaires_ibfk_1` FOREIGN KEY (`facture_id`) REFERENCES `factures_commerciales` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Views (SQL SECURITY INVOKER ; pas de DEFINER root — adapté aux BDD distantes MySQL 5.7+/8.x)
--

CREATE ALGORITHM=UNDEFINED SQL SECURITY INVOKER VIEW `vue_connaissement_complet` AS
SELECT
  `c`.`id` AS `id`,
  `c`.`bl_number` AS `bl_number`,
  `c`.`carrier` AS `carrier`,
  `c`.`shipper_name` AS `shipper_name`,
  `c`.`consignee_name` AS `consignee_name`,
  `c`.`vessel_name` AS `vessel_name`,
  `c`.`voyage_number` AS `voyage_number`,
  `c`.`port_of_loading` AS `port_of_loading`,
  `c`.`port_of_discharge` AS `port_of_discharge`,
  `c`.`total_weight_kg` AS `total_weight_kg`,
  `c`.`total_measurement_cbm` AS `total_measurement_cbm`,
  COUNT(DISTINCT `cont`.`id`) AS `nombre_conteneurs`,
  GROUP_CONCAT(DISTINCT `cont`.`container_number` SEPARATOR ',') AS `conteneurs`,
  `dd`.`feri_number` AS `feri_number`,
  `dd`.`bv_number` AS `bv_number`
FROM (`connaissements` `c`
  LEFT JOIN `conteneurs` `cont` ON `c`.`id` = `cont`.`connaissement_id`
  LEFT JOIN `documents_douaniers` `dd` ON `c`.`id` = `dd`.`connaissement_id`)
GROUP BY `c`.`id`;

CREATE ALGORITHM=UNDEFINED SQL SECURITY INVOKER VIEW `vue_facture_detaillee` AS
SELECT
  `fc`.`id` AS `facture_id`,
  `fc`.`invoice_number` AS `invoice_number`,
  `fc`.`invoice_date` AS `invoice_date`,
  `fc`.`contract_number` AS `contract_number`,
  `fc`.`fob_value` AS `fob_value`,
  `fc`.`ocean_freight` AS `ocean_freight`,
  `fc`.`insurance` AS `insurance`,
  `fc`.`total_cip_value` AS `total_cip_value`,
  `af`.`id` AS `article_id`,
  `af`.`line_number` AS `line_number`,
  `af`.`quantity` AS `quantity`,
  `af`.`unit_price` AS `unit_price`,
  `af`.`total_price` AS `total_price`,
  MAX(CASE WHEN `aa`.`attribute_name` = 'model' THEN `aa`.`attribute_value` END) AS `model`,
  MAX(CASE WHEN `aa`.`attribute_name` = 'machine_no' THEN `aa`.`attribute_value` END) AS `machine_no`,
  MAX(CASE WHEN `aa`.`attribute_name` = 'chassis_no' THEN `aa`.`attribute_value` END) AS `chassis_no`,
  MAX(CASE WHEN `aa`.`attribute_name` = 'engine_no' THEN `aa`.`attribute_value` END) AS `engine_no`,
  MAX(CASE WHEN `aa`.`attribute_name` = 'year' THEN `aa`.`attribute_value` END) AS `year`,
  MAX(CASE WHEN `aa`.`attribute_name` = 'color' THEN `aa`.`attribute_value` END) AS `color`
FROM (`factures_commerciales` `fc`
  LEFT JOIN `articles_facture` `af` ON `fc`.`id` = `af`.`facture_id`
  LEFT JOIN `articles_attributes` `aa` ON `af`.`id` = `aa`.`article_id`)
GROUP BY `fc`.`id`, `af`.`id`;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-05-10 18:23:01

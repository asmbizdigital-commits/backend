-- Table des taux de change journaliers (1 devise = X FC)
CREATE TABLE IF NOT EXISTS tbl_taux_jour (
  id INT NOT NULL AUTO_INCREMENT,
  date DATE NOT NULL COMMENT 'Date du taux (jour concerné)',
  devise VARCHAR(5) NOT NULL COMMENT 'Code devise (USD, EUR, GBP, CNY, JPY)',
  taux DECIMAL(18, 4) NOT NULL COMMENT '1 unité devise = taux FC',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_taux_jour_date_devise (date, devise),
  KEY idx_taux_jour_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

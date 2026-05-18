const path = require('path');
const { Sequelize } = require('sequelize');

// Racine du repo puis backend/.env (override) — la config ASM/Clever Cloud est dans backend/.env
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env'), override: true });

const sequelize = new Sequelize(
  process.env.DB_NAME || 'asmdb',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 20, // Increased for concurrent users
      min: 5,  // Keep minimum connections ready
      acquire: 60000, // Longer timeout for connection acquisition
      idle: 10000,
      evict: 1000, // Check for dead connections every second
      handleDisconnects: true
    },
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true
    },
    dialectOptions: {
      // Handle connection timeouts gracefully
      supportBigNumbers: true,
      bigNumberStrings: true
    },
    retry: {
      max: 3, // Retry failed queries up to 3 times
      timeout: 10000 // Wait 10 seconds between retries
    }
  }
);

module.exports = { sequelize }; 
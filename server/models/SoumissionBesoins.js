const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SoumissionBesoins = sequelize.define('SoumissionBesoins', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  type: {
    type: DataTypes.ENUM('materiel', 'fonds'),
    allowNull: false
  },
  demandeur_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'tbl_utilisateurs', key: 'id' }
  },
  superviseur_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'tbl_utilisateurs', key: 'id' }
  },
  statut: {
    type: DataTypes.ENUM('en_attente', 'approuvee', 'rejetee', 'annulee'),
    allowNull: false,
    defaultValue: 'en_attente'
  },
  motif: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  commentaire: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  montant_total: {
    type: DataTypes.DECIMAL(14, 2),
    allowNull: true
  },
  devise: {
    type: DataTypes.ENUM('EUR', 'USD', 'FC'),
    allowNull: true,
    defaultValue: 'FC'
  },
  commentaire_superviseur: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  date_validation: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'tbl_soumissions_besoins',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = SoumissionBesoins;

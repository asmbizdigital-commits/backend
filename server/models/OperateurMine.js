const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const OperateurMine = sequelize.define('OperateurMine', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  raison_sociale: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  sigle: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  type_operateur: {
    type: DataTypes.ENUM('societe_miniere', 'cooperative', 'artisanat', 'autre'),
    allowNull: false,
    defaultValue: 'societe_miniere'
  },
  reference_administrative: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  adresse: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  telephone: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  contact_principal: {
    type: DataTypes.STRING(150),
    allowNull: true
  },
  statut: {
    type: DataTypes.ENUM('actif', 'inactif', 'suspendu'),
    allowNull: false,
    defaultValue: 'actif'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'tbl_operateurs_mines',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = OperateurMine;

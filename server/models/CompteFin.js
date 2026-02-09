const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CompteFin = sequelize.define('CompteFin', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  code: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true,
    validate: { notEmpty: true }
  },
  libelle: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: { notEmpty: true }
  },
  type_compte: {
    type: DataTypes.ENUM('actif', 'passif', 'charge', 'produit', 'tresorerie'),
    allowNull: false
  },
  parent_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_fin_comptes', key: 'id' }
  },
  solde_ouverture: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0
  },
  devise: {
    type: DataTypes.STRING(5),
    allowNull: false,
    defaultValue: 'FC'
  },
  actif: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'tbl_fin_comptes',
  timestamps: true,
  underscored: true
});

module.exports = CompteFin;

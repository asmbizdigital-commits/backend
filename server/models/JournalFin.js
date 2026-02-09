const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const JournalFin = sequelize.define('JournalFin', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  code: {
    type: DataTypes.STRING(10),
    allowNull: false,
    unique: true,
    validate: { notEmpty: true }
  },
  libelle: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: { notEmpty: true }
  },
  type_journal: {
    type: DataTypes.ENUM('banque', 'caisse', 'ventes', 'achats', 'od'),
    allowNull: false,
    defaultValue: 'od'
  },
  actif: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'tbl_fin_journaux',
  timestamps: true,
  underscored: true
});

module.exports = JournalFin;

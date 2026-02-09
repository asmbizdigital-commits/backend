const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const RedevanceMine = sequelize.define('RedevanceMine', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  operateur_nom: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  type_redevance: {
    type: DataTypes.ENUM('redevance_miniere', 'superficiaire', 'autre'),
    allowNull: false,
    defaultValue: 'redevance_miniere'
  },
  periode: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  montant_due: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0
  },
  devise: {
    type: DataTypes.STRING(5),
    allowNull: false,
    defaultValue: 'USD'
  },
  date_echeance: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  montant_paye: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0
  },
  statut: {
    type: DataTypes.ENUM('due', 'partiellement_payee', 'payee', 'en_retard'),
    allowNull: false,
    defaultValue: 'due'
  },
  reference: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'tbl_redevances_mines',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = RedevanceMine;

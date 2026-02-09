const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const LigneBudgetFin = sequelize.define('LigneBudgetFin', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  budget_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'tbl_fin_budgets', key: 'id' }
  },
  compte_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'tbl_fin_comptes', key: 'id' }
  },
  montant_prevu: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0
  },
  ordre: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'tbl_fin_budget_lignes',
  timestamps: true,
  updatedAt: false,
  underscored: true
});

module.exports = LigneBudgetFin;

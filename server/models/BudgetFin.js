const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const BudgetFin = sequelize.define('BudgetFin', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  libelle: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: { notEmpty: true }
  },
  annee: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  statut: {
    type: DataTypes.ENUM('brouillon', 'valide'),
    allowNull: false,
    defaultValue: 'brouillon'
  },
  devise: {
    type: DataTypes.STRING(5),
    allowNull: false,
    defaultValue: 'FC'
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_utilisateurs', key: 'id' }
  }
}, {
  tableName: 'tbl_fin_budgets',
  timestamps: true,
  underscored: true
});

module.exports = BudgetFin;

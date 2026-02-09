const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PaiementRedevance = sequelize.define('PaiementRedevance', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  redevance_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'tbl_redevances_mines', key: 'id' }
  },
  date_paiement: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  montant: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  devise: {
    type: DataTypes.STRING(5),
    allowNull: false,
    defaultValue: 'USD'
  },
  reference_paiement: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  mode_paiement: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'tbl_paiements_redevances',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = PaiementRedevance;

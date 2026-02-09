const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const TauxJour = sequelize.define('TauxJour', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Date du taux (jour concerné)'
  },
  devise: {
    type: DataTypes.STRING(5),
    allowNull: false,
    comment: 'Code devise (USD, EUR, GBP, CNY, JPY)'
  },
  taux: {
    type: DataTypes.DECIMAL(18, 4),
    allowNull: false,
    comment: '1 unité devise = taux FC'
  }
}, {
  tableName: 'tbl_taux_jour',
  timestamps: true,
  underscored: true,
  indexes: [
    { unique: true, fields: ['date', 'devise'] },
    { fields: ['date'] }
  ]
});

module.exports = TauxJour;

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ParametresSys = sequelize.define('ParametresSys', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  section: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: 'general, societe, finances, facturation, affichage'
  },
  data: {
    type: DataTypes.JSON,
    allowNull: false,
    comment: 'Objet JSON des clés/valeurs de la section'
  }
}, {
  tableName: 'tbl_parametres_sys',
  timestamps: true,
  underscored: true
});

module.exports = ParametresSys;

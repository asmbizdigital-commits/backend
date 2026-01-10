const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Circuit = sequelize.define('Circuit', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  nom: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: { notEmpty: true }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  etapes: {
    type: DataTypes.JSON,
    allowNull: false,
    get() {
      const value = this.getDataValue('etapes');
      return typeof value === 'string' ? JSON.parse(value) : value;
    },
    set(value) {
      this.setDataValue('etapes', typeof value === 'string' ? value : JSON.stringify(value));
    }
  },
  actif: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'tbl_utilisateurs', key: 'id' }
  }
}, {
  tableName: 'tbl_circuits',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['actif'] }
  ]
});

module.exports = Circuit;


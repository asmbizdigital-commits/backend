const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Zone = sequelize.define(
  'Zone',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    code: {
      type: DataTypes.STRING(30),
      allowNull: false,
      unique: true
    },
    nom: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    statut: {
      type: DataTypes.ENUM('Actif', 'Inactif'),
      allowNull: false,
      defaultValue: 'Actif'
    }
  },
  {
    tableName: 'zones',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

module.exports = Zone;

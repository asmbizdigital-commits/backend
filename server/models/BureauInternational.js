const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const BureauInternational = sequelize.define('BureauInternational', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  nom: {
    type: DataTypes.STRING(200),
    allowNull: false,
    validate: { notEmpty: true, len: [1, 200] }
  },
  code: {
    type: DataTypes.STRING(30),
    allowNull: true,
    unique: true
  },
  pays: {
    type: DataTypes.STRING(150),
    allowNull: true
  },
  ville: {
    type: DataTypes.STRING(150),
    allowNull: true
  },
  responsable_bureau: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  telephone: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  adresse: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  statut: {
    type: DataTypes.ENUM('Actif', 'Inactif'),
    allowNull: false,
    defaultValue: 'Actif'
  }
}, {
  tableName: 'tbl_bureaux_internationaux',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = BureauInternational;

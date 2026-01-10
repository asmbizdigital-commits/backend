const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Folder = sequelize.define('Folder', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  nom: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: { notEmpty: true, len: [1, 255] }
  },
  parent_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_folders', key: 'id' }
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  couleur: {
    type: DataTypes.STRING(7),
    allowNull: true
  },
  visibilite: {
    type: DataTypes.ENUM('Public', 'Privé', 'Interne'),
    allowNull: false,
    defaultValue: 'Interne'
  },
  nombre_fichiers: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  supprime: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  date_suppression: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'tbl_folders',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['parent_id'] },
    { fields: ['user_id'] },
    { fields: ['supprime'] }
  ]
});

module.exports = Folder;


const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Validation = sequelize.define('Validation', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  file_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'tbl_files', key: 'id' }
  },
  circuit_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'tbl_circuits', key: 'id' }
  },
  etape: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  ordre: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  validateur_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_utilisateurs', key: 'id' }
  },
  statut: {
    type: DataTypes.ENUM('En attente', 'Approuvé', 'Rejeté', 'Ignoré'),
    allowNull: false,
    defaultValue: 'En attente'
  },
  commentaire: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  date_validation: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'tbl_validations',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['file_id'] },
    { fields: ['circuit_id'] },
    { fields: ['validateur_id'] },
    { fields: ['statut'] }
  ]
});

module.exports = Validation;


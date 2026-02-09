const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const EcritureFin = sequelize.define('EcritureFin', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  journal_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'tbl_fin_journaux', key: 'id' }
  },
  numero_piece: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    validate: { notEmpty: true }
  },
  date_ecriture: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  libelle: {
    type: DataTypes.STRING(500),
    allowNull: false,
    validate: { notEmpty: true }
  },
  reference_externe: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  valide: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_utilisateurs', key: 'id' }
  }
}, {
  tableName: 'tbl_fin_ecritures',
  timestamps: true,
  underscored: true
});

module.exports = EcritureFin;

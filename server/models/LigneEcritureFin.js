const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const LigneEcritureFin = sequelize.define('LigneEcritureFin', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  ecriture_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'tbl_fin_ecritures', key: 'id' }
  },
  compte_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'tbl_fin_comptes', key: 'id' }
  },
  libelle_ligne: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  debit: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0
  },
  credit: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0
  },
  ordre: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'tbl_fin_lignes_ecriture',
  timestamps: true,
  updatedAt: false,
  underscored: true
});

module.exports = LigneEcritureFin;

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const LigneFactureFin = sequelize.define('LigneFactureFin', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  facture_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'tbl_fin_factures', key: 'id' }
  },
  compte_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_fin_comptes', key: 'id' }
  },
  libelle: {
    type: DataTypes.STRING(500),
    allowNull: false,
    validate: { notEmpty: true }
  },
  quantite: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 1
  },
  prix_unitaire: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0
  },
  montant_ht: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0
  },
  taux_tva: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0
  },
  montant_ttc: {
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
  tableName: 'tbl_fin_facture_lignes',
  timestamps: true,
  updatedAt: false,
  underscored: true
});

module.exports = LigneFactureFin;

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const FactureFin = sequelize.define('FactureFin', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  numero: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    validate: { notEmpty: true }
  },
  client_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_clients', key: 'id' }
  },
  client_nom: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: { notEmpty: true }
  },
  client_email: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  client_adresse: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  client_telephone: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  date_facture: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  date_echeance: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  statut: {
    type: DataTypes.ENUM('brouillon', 'envoyee', 'payee', 'annulee'),
    allowNull: false,
    defaultValue: 'brouillon'
  },
  total_ht: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0
  },
  total_tva: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0
  },
  total_ttc: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0
  },
  devise: {
    type: DataTypes.STRING(5),
    allowNull: false,
    defaultValue: 'FC'
  },
  template_code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'modern'
  },
  remarques: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  ecriture_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_fin_ecritures', key: 'id' }
  },
  caisse_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_caisses', key: 'id' }
  },
  encaissement_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_encaissements', key: 'id' }
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_utilisateurs', key: 'id' }
  }
}, {
  tableName: 'tbl_fin_factures',
  timestamps: true,
  underscored: true
});

module.exports = FactureFin;

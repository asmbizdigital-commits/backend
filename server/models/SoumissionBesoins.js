const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SoumissionBesoins = sequelize.define('SoumissionBesoins', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  type: {
    type: DataTypes.ENUM('materiel', 'fonds'),
    allowNull: false
  },
  demandeur_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'tbl_utilisateurs', key: 'id' }
  },
  superviseur_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'tbl_utilisateurs', key: 'id' }
  },
  statut: {
    type: DataTypes.ENUM('en_attente', 'approuvee', 'rejetee', 'annulee'),
    allowNull: false,
    defaultValue: 'en_attente'
  },
  motif: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  commentaire: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  montant_total: {
    type: DataTypes.DECIMAL(14, 2),
    allowNull: true
  },
  devise: {
    type: DataTypes.ENUM('EUR', 'USD', 'FC'),
    allowNull: true,
    defaultValue: 'FC'
  },
  commentaire_superviseur: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  date_validation: {
    type: DataTypes.DATE,
    allowNull: true
  },
  piece_justificative_1_url: { type: DataTypes.STRING(512), allowNull: true },
  piece_justificative_1_nom: { type: DataTypes.STRING(255), allowNull: true },
  piece_justificative_2_url: { type: DataTypes.STRING(512), allowNull: true },
  piece_justificative_2_nom: { type: DataTypes.STRING(255), allowNull: true },
  piece_justificative_3_url: { type: DataTypes.STRING(512), allowNull: true },
  piece_justificative_3_nom: { type: DataTypes.STRING(255), allowNull: true }
}, {
  tableName: 'tbl_soumissions_besoins',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = SoumissionBesoins;

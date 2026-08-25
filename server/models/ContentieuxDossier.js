const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Dossiers mis en contentieux par un Verificateur Sygrem / Controlleur Sygram.
 * Table : tbl_contentieux_dossiers
 */
const ContentieuxDossier = sequelize.define(
  'ContentieuxDossier',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    connaissementId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'connaissement_id'
    },
    numeroDossier: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'numero_dossier'
    },
    blNumber: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'bl_number'
    },
    saisisseurId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'saisisseur_id',
      references: { model: 'tbl_utilisateurs', key: 'id' }
    },
    saisisseurNom: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'saisisseur_nom'
    },
    creeParId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'cree_par_id',
      references: { model: 'tbl_utilisateurs', key: 'id' }
    },
    statut: {
      type: DataTypes.ENUM('Nouveau', 'En cours', 'Clôturé', 'Annulé'),
      allowNull: false,
      defaultValue: 'Nouveau'
    },
    commentaire: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  },
  {
    tableName: 'tbl_contentieux_dossiers',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['connaissement_id'], unique: true },
      { fields: ['numero_dossier'] },
      { fields: ['cree_par_id'] },
      { fields: ['statut'] },
      { fields: ['created_at'] }
    ]
  }
);

module.exports = ContentieuxDossier;

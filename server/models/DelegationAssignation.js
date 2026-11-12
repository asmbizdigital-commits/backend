const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Délégation du droit d’assigner des dossiers (Manager Bureau → Saisisseur),
 * limitée dans le temps et par des conditions.
 */
const DelegationAssignation = sequelize.define(
  'DelegationAssignation',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    delegataireId: { type: DataTypes.INTEGER, allowNull: false, field: 'delegataire_id' },
    accordeParId: { type: DataTypes.INTEGER, allowNull: false, field: 'accorde_par_id' },
    bureauInternationalId: { type: DataTypes.INTEGER, allowNull: false, field: 'bureau_international_id' },
    dateDebut: { type: DataTypes.DATE, allowNull: false, field: 'date_debut' },
    dateFin: { type: DataTypes.DATE, allowNull: false, field: 'date_fin' },
    /** null = illimité */
    maxDossiersParJour: { type: DataTypes.INTEGER, allowNull: true, field: 'max_dossiers_par_jour' },
    /** null = illimité (sur toute la période) */
    maxDossiersTotal: { type: DataTypes.INTEGER, allowNull: true, field: 'max_dossiers_total' },
    /** null = toutes ; sinon tableau parmi Normale / Haute / Urgente */
    prioritesAutorisees: { type: DataTypes.JSON, allowNull: true, field: 'priorites_autorisees' },
    /** 'bureau' = tous les saisisseurs du bureau ; 'liste' = destinataireIds */
    portee: { type: DataTypes.ENUM('bureau', 'liste'), allowNull: false, defaultValue: 'bureau' },
    destinataireIds: { type: DataTypes.JSON, allowNull: true, field: 'destinataire_ids' },
    peutSAutoAssigner: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'peut_s_auto_assigner'
    },
    commentaire: { type: DataTypes.TEXT, allowNull: true },
    revoque: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    revoqueLe: { type: DataTypes.DATE, allowNull: true, field: 'revoque_le' },
    revoqueParId: { type: DataTypes.INTEGER, allowNull: true, field: 'revoque_par_id' }
  },
  {
    tableName: 'tbl_delegations_assignation',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

module.exports = DelegationAssignation;

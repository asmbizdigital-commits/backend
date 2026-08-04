const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DossierActivityLog = sequelize.define(
  'DossierActivityLog',
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
    actionType: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'action_type'
    },
    actorId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'actor_id'
    },
    actorName: {
      type: DataTypes.STRING(191),
      allowNull: true,
      field: 'actor_name'
    },
    actorRole: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'actor_role'
    },
    assigneeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'assignee_id'
    },
    assigneeName: {
      type: DataTypes.STRING(191),
      allowNull: true,
      field: 'assignee_name'
    },
    taskProId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'task_pro_id'
    },
    assignationId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'assignation_id'
    },
    dossierRef: {
      type: DataTypes.STRING(191),
      allowNull: true,
      field: 'dossier_ref'
    },
    blNumber: {
      type: DataTypes.STRING(191),
      allowNull: true,
      field: 'bl_number'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true
    },
    durationMs: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'duration_ms'
    },
    referenceAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reference_at'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at'
    }
  },
  {
    tableName: 'tbl_dossier_activity_log',
    timestamps: false,
    underscored: true,
    updatedAt: false
  }
);

module.exports = DossierActivityLog;

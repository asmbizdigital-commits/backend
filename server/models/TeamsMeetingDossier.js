const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const TeamsMeetingDossier = sequelize.define(
  'TeamsMeetingDossier',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    meetingId: { type: DataTypes.INTEGER, allowNull: false, field: 'meeting_id' },
    connaissementId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'connaissement_id'
    },
    label: { type: DataTypes.STRING(255), allowNull: true }
  },
  {
    tableName: 'tbl_teams_meeting_dossiers',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: false
  }
);

module.exports = TeamsMeetingDossier;

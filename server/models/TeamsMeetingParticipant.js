const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const TeamsMeetingParticipant = sequelize.define(
  'TeamsMeetingParticipant',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    meetingId: { type: DataTypes.INTEGER, allowNull: false, field: 'meeting_id' },
    userId: { type: DataTypes.INTEGER, field: 'user_id' },
    email: { type: DataTypes.STRING(255), allowNull: false },
    displayName: { type: DataTypes.STRING(255), field: 'display_name' },
    participantType: {
      type: DataTypes.ENUM('required', 'optional', 'organizer'),
      defaultValue: 'required',
      field: 'participant_type'
    }
  },
  {
    tableName: 'tbl_teams_meeting_participants',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: false
  }
);

module.exports = TeamsMeetingParticipant;

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const TeamsMeeting = sequelize.define(
  'TeamsMeeting',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    createdBy: { type: DataTypes.INTEGER, allowNull: false, field: 'created_by' },
    microsoftEventId: { type: DataTypes.STRING(500), field: 'microsoft_event_id' },
    microsoftMeetingId: { type: DataTypes.STRING(500), field: 'microsoft_meeting_id' },
    subject: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT },
    startAt: { type: DataTypes.DATE, allowNull: false, field: 'start_at' },
    endAt: { type: DataTypes.DATE, allowNull: false, field: 'end_at' },
    timezone: { type: DataTypes.STRING(100), defaultValue: 'Africa/Kinshasa' },
    joinUrl: { type: DataTypes.TEXT, field: 'join_url' },
    referenceType: { type: DataTypes.STRING(100), field: 'reference_type' },
    referenceId: { type: DataTypes.INTEGER, field: 'reference_id' },
    status: {
      type: DataTypes.ENUM('scheduled', 'started', 'completed', 'cancelled'),
      defaultValue: 'scheduled'
    }
  },
  {
    tableName: 'tbl_teams_meetings',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

module.exports = TeamsMeeting;

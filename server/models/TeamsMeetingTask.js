const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const TeamsMeetingTask = sequelize.define(
  'TeamsMeetingTask',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    meetingId: { type: DataTypes.INTEGER, allowNull: true, field: 'meeting_id' },
    joinUrl: { type: DataTypes.TEXT, allowNull: true, field: 'join_url' },
    taskProId: { type: DataTypes.INTEGER, allowNull: false, field: 'task_pro_id' },
    createdBy: { type: DataTypes.INTEGER, allowNull: true, field: 'created_by' }
  },
  {
    tableName: 'tbl_teams_meeting_tasks',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: false
  }
);

module.exports = TeamsMeetingTask;

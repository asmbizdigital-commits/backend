const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/** Accusé de lecture d’une notice par un utilisateur (popup fermée avec « J’ai lu »). */
const NoticeLecture = sequelize.define(
  'NoticeLecture',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    noticeId: { type: DataTypes.INTEGER, allowNull: false, field: 'notice_id' },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    luLe: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'lu_le' }
  },
  {
    tableName: 'tbl_notice_lectures',
    timestamps: false
  }
);

module.exports = NoticeLecture;

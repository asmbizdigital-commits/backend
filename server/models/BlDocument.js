const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Documents B/L extraits (table bl_documents).
 */
const BlDocument = sequelize.define(
  'BlDocument',
  {
    id: { type: DataTypes.STRING(36), primaryKey: true },
    fileName: { type: DataTypes.STRING(512), allowNull: false, field: 'file_name' },
    fileHash: { type: DataTypes.STRING(64), allowNull: false, field: 'file_hash' },
    blNumber: { type: DataTypes.STRING(64), field: 'bl_number' },
    bookingNumber: { type: DataTypes.STRING(64), field: 'booking_number' },
    vessel: { type: DataTypes.STRING(255) },
    portLoading: { type: DataTypes.STRING(255), field: 'port_loading' },
    portDischarge: { type: DataTypes.STRING(255), field: 'port_discharge' },
    weight: { type: DataTypes.STRING(64) },
    rawText: { type: DataTypes.TEXT('long'), field: 'raw_text' },
    status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'pending' },
    createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
    shipper: { type: DataTypes.TEXT },
    consignee: { type: DataTypes.TEXT }
  },
  {
    tableName: 'bl_documents',
    timestamps: false,
    underscored: false
  }
);

module.exports = BlDocument;

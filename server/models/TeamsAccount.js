const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const TeamsAccount = sequelize.define(
  'TeamsAccount',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    microsoftUserId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'microsoft_user_id'
    },
    microsoftEmail: { type: DataTypes.STRING(255), field: 'microsoft_email' },
    displayName: { type: DataTypes.STRING(255), field: 'display_name' },
    tenantId: { type: DataTypes.STRING(255), field: 'tenant_id' },
    accessTokenEnc: { type: DataTypes.TEXT, field: 'access_token_enc' },
    refreshTokenEnc: { type: DataTypes.TEXT, field: 'refresh_token_enc' },
    tokenExpiresAt: { type: DataTypes.DATE, field: 'token_expires_at' },
    scopes: { type: DataTypes.TEXT },
    connectedAt: { type: DataTypes.DATE, field: 'connected_at' }
  },
  {
    tableName: 'tbl_teams_accounts',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

module.exports = TeamsAccount;

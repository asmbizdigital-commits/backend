const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Notice board : message de l’Administrateur affiché en popup aux utilisateurs ciblés.
 * cibleType : tous | bureau | role | utilisateurs
 */
const Notice = sequelize.define(
  'Notice',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    titre: { type: DataTypes.STRING(200), allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    niveau: { type: DataTypes.ENUM('info', 'important', 'urgent'), allowNull: false, defaultValue: 'info' },
    cibleType: {
      type: DataTypes.ENUM('tous', 'bureau', 'role', 'utilisateurs'),
      allowNull: false,
      defaultValue: 'tous',
      field: 'cible_type'
    },
    cibleBureauIds: { type: DataTypes.JSON, allowNull: true, field: 'cible_bureau_ids' },
    cibleRoles: { type: DataTypes.JSON, allowNull: true, field: 'cible_roles' },
    cibleUserIds: { type: DataTypes.JSON, allowNull: true, field: 'cible_user_ids' },
    dateDebut: { type: DataTypes.DATE, allowNull: false, field: 'date_debut' },
    dateFin: { type: DataTypes.DATE, allowNull: true, field: 'date_fin' },
    actif: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    creeParId: { type: DataTypes.INTEGER, allowNull: false, field: 'cree_par_id' }
  },
  {
    tableName: 'tbl_notices',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

module.exports = Notice;

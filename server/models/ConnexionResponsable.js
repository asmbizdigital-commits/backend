const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/** Liaison Responsable Zone ↔ direction provinciale OU bureau international. */
const ConnexionResponsable = sequelize.define(
  'ConnexionResponsable',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    utilisateurId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'utilisateur_id'
    },
    directionProvincialeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'direction_provinciale_id'
    },
    bureauInternationalId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'bureau_international_id'
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'created_by'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'updated_at'
    }
  },
  {
    tableName: 'tbl_connexions_responsables',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

module.exports = ConnexionResponsable;

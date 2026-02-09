const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const EmployeUser = sequelize.define('EmployeUser', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  employe_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: { model: 'tbl_employes', key: 'id' },
    comment: "ID de l'employé"
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: { model: 'tbl_utilisateurs', key: 'id' },
    comment: "ID du compte utilisateur"
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'tbl_employe_utilisateur',
  timestamps: false,
  underscored: true,
  comment: "Liaison employé - utilisateur (compte de connexion)",
  indexes: [
    { unique: true, fields: ['employe_id'] },
    { unique: true, fields: ['user_id'] }
  ]
});

module.exports = EmployeUser;

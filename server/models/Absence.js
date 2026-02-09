const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Absence = sequelize.define('Absence', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  employe_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'tbl_employes', key: 'id' }
  },
  date_absence: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    validate: { isDate: true },
    comment: "Date de l'absence"
  },
  type_absence: {
    type: DataTypes.ENUM('justifiee', 'non_justifiee'),
    allowNull: false,
    defaultValue: 'non_justifiee'
  },
  motif: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  demande_conge_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_demandes_conges', key: 'id' },
    comment: 'Lien vers une demande de congé approuvée si applicable'
  },
  enregistre_par_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_utilisateurs', key: 'id' }
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'tbl_absences',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  comment: 'Suivi des absences - justifiées / non justifiées',
  indexes: [
    { fields: ['employe_id'] },
    { fields: ['date_absence'] },
    { fields: ['type_absence'] },
    { fields: ['demande_conge_id'] }
  ]
});

module.exports = Absence;

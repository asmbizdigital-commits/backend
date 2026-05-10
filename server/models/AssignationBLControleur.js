const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AssignationBLControleur = sequelize.define(
  'AssignationBLControleur',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    connaissementId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'connaissement_id'
    },
    assigneeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'assignee_id',
      references: { model: 'tbl_utilisateurs', key: 'id' }
    },
    roleCible: {
      type: DataTypes.ENUM('Contrôleur Sygram'),
      allowNull: false,
      defaultValue: 'Contrôleur Sygram',
      field: 'role_cible'
    },
    priorite: {
      type: DataTypes.ENUM('Normale', 'Haute', 'Urgente'),
      allowNull: false,
      defaultValue: 'Normale'
    },
    dateLimite: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'date_limite'
    },
    commentaire: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    statut: {
      type: DataTypes.ENUM('Assignée', 'En cours', 'Terminée', 'Annulée'),
      allowNull: false,
      defaultValue: 'Assignée'
    },
    taskProId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'task_pro_id',
      references: { model: 'tbl_task_pro', key: 'id' }
    },
    assigneParId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'assigne_par_id',
      references: { model: 'tbl_utilisateurs', key: 'id' }
    }
  },
  {
    tableName: 'tbl_assignation_bl_controleur',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['connaissement_id'] },
      { fields: ['assignee_id'] },
      { fields: ['statut'] },
      { fields: ['task_pro_id'] },
      { fields: ['created_at'] }
    ]
  }
);

module.exports = AssignationBLControleur;

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DemandeConge = sequelize.define('DemandeConge', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  employe_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'tbl_employes', key: 'id' },
    comment: "ID de l'employé demandeur"
  },
  type_conge: {
    type: DataTypes.ENUM('conges_payes_annuels', 'maladie', 'maternite', 'paternite', 'sans_solde', 'deces_famille', 'mariage', 'autre'),
    allowNull: false,
    comment: 'Type selon Code du Travail RDC'
  },
  date_debut: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    validate: { isDate: true },
    comment: 'Date de début du congé'
  },
  date_fin: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    validate: { isDate: true },
    comment: 'Date de fin du congé'
  },
  nombre_jours: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 1 },
    comment: 'Nombre de jours demandés'
  },
  motif: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: { notEmpty: true },
    comment: 'Motif ou justification'
  },
  piece_jointe_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'URL certificat médical ou autre justificatif'
  },
  statut: {
    type: DataTypes.ENUM('en_attente', 'approuve', 'rejete', 'annule'),
    allowNull: false,
    defaultValue: 'en_attente',
    comment: 'Statut de la demande'
  },
  demandeur_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'tbl_utilisateurs', key: 'id' },
    comment: "Utilisateur qui soumet (employé ou RH)"
  },
  validateur_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_utilisateurs', key: 'id' },
    comment: 'Superviseur RH qui valide'
  },
  date_validation: {
    type: DataTypes.DATE,
    allowNull: true
  },
  commentaire_rh: {
    type: DataTypes.TEXT,
    allowNull: true
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
  tableName: 'tbl_demandes_conges',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  comment: 'Demandes de congés - Code du Travail RDC',
  indexes: [
    { fields: ['employe_id'] },
    { fields: ['type_conge'] },
    { fields: ['statut'] },
    { fields: ['date_debut'] },
    { fields: ['demandeur_id'] }
  ]
});

module.exports = DemandeConge;

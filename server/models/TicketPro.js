const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PLAINTE_CATEGORIES = [
  'Service', 'Qualité', 'Sécurité', 'Ressources Humaines', 'Financier', 'Technique', 'Autre'
];
const PRIORITES = ['Basse', 'Normale', 'Haute', 'Urgente'];
const PLAINTE_STATUTS = ['Nouvelle', 'En cours', 'En attente', 'Résolue', 'Fermée', 'Rejetée'];
const TICKET_STATUTS = ['Ouvert', 'En cours', 'En attente', 'Résolu', 'Fermé', 'Annulé'];

const TicketPro = sequelize.define('TicketPro', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  numero_ticket: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  plainte_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'tbl_plaintes', key: 'id' }
  },
  numero_plainte_ref: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  plainte_type: {
    type: DataTypes.ENUM('Interne', 'Externe'),
    allowNull: false
  },
  plainte_titre: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  plainte_description: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  plainte_categorie: {
    type: DataTypes.ENUM(...PLAINTE_CATEGORIES),
    allowNull: false,
    defaultValue: 'Autre'
  },
  plainte_priorite: {
    type: DataTypes.ENUM(...PRIORITES),
    allowNull: false,
    defaultValue: 'Normale'
  },
  plainte_statut: {
    type: DataTypes.ENUM(...PLAINTE_STATUTS),
    allowNull: false,
    defaultValue: 'Nouvelle'
  },
  plainte_zone: {
    type: DataTypes.STRING(30),
    allowNull: true
  },
  direction_provinciale_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_directions_provinciales', key: 'id' }
  },
  bureau_international_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_bureaux_internationaux', key: 'id' }
  },
  plaignant_nom: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  plaignant_prenom: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  plaignant_email: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  titre: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  priorite: {
    type: DataTypes.ENUM(...PRIORITES),
    allowNull: false,
    defaultValue: 'Normale'
  },
  statut: {
    type: DataTypes.ENUM(...TICKET_STATUTS),
    allowNull: false,
    defaultValue: 'Ouvert'
  },
  createur_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'tbl_utilisateurs', key: 'id' }
  },
  assignee_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_utilisateurs', key: 'id' }
  },
  notes_ouverture: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  date_echeance: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'tbl_tickets_pro',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = TicketPro;

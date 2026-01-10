const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const File = sequelize.define('File', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  nom_fichier: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: { notEmpty: true }
  },
  titre: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  nom_fichier_stocke: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  chemin_fichier: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  public_id: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  type_mime: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  type: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  taille: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  extension: {
    type: DataTypes.STRING(10),
    allowNull: true
  },
  folder_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_folders', key: 'id' }
  },
  circuit_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_circuits', key: 'id' }
  },
  etape_actuelle: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  statut_workflow: {
    type: DataTypes.ENUM('En attente', 'En cours', 'Approuvé', 'Rejeté', 'Annulé'),
    allowNull: false,
    defaultValue: 'En attente'
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  langue: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  sujet: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  identifiant: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  editeur: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  format_metadata: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  source: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  type_metadata: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  couverture: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  droits: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  relations: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  date_creation: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  tags: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      return this.getDataValue('tags') ? JSON.parse(this.getDataValue('tags')) : [];
    },
    set(value) {
      this.setDataValue('tags', value ? JSON.stringify(value) : null);
    }
  },
  visibilite: {
    type: DataTypes.ENUM('Public', 'Privé', 'Interne'),
    allowNull: false,
    defaultValue: 'Interne'
  },
  nombre_downloads: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  nombre_vues: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  derniere_vue: {
    type: DataTypes.DATE,
    allowNull: true
  },
  supprime: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  date_suppression: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'tbl_files',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['folder_id'] },
    { fields: ['circuit_id'] },
    { fields: ['user_id'] },
    { fields: ['type'] },
    { fields: ['visibilite'] },
    { fields: ['supprime'] },
    { fields: ['statut_workflow'] },
    { fields: ['created_at'] }
  ]
});

module.exports = File;


const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Client = sequelize.define('Client', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  type_client: {
    type: DataTypes.ENUM('particulier', 'entreprise'),
    allowNull: false,
    defaultValue: 'particulier'
  },
  nom: { type: DataTypes.STRING(255), allowNull: true },
  prenom: { type: DataTypes.STRING(255), allowNull: true },
  raison_sociale: { type: DataTypes.STRING(255), allowNull: true },
  forme_juridique: { type: DataTypes.STRING(100), allowNull: true },
  email: { type: DataTypes.STRING(255), allowNull: true },
  telephone: { type: DataTypes.STRING(50), allowNull: true },
  telephone_secondaire: { type: DataTypes.STRING(50), allowNull: true },
  mobile: { type: DataTypes.STRING(50), allowNull: true },
  fax: { type: DataTypes.STRING(50), allowNull: true },
  adresse: { type: DataTypes.TEXT, allowNull: true },
  complement_adresse: { type: DataTypes.STRING(255), allowNull: true },
  code_postal: { type: DataTypes.STRING(20), allowNull: true },
  ville: { type: DataTypes.STRING(150), allowNull: true },
  region: { type: DataTypes.STRING(150), allowNull: true },
  pays: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'RDC' },
  numero_nif: { type: DataTypes.STRING(50), allowNull: true },
  numero_rc: { type: DataTypes.STRING(50), allowNull: true },
  numero_piece: { type: DataTypes.STRING(100), allowNull: true },
  type_piece: { type: DataTypes.STRING(50), allowNull: true },
  categorie: { type: DataTypes.STRING(50), allowNull: true },
  source: { type: DataTypes.STRING(100), allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  tags: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const v = this.getDataValue('tags');
      return v ? (typeof v === 'string' ? JSON.parse(v) : v) : [];
    },
    set(val) {
      this.setDataValue('tags', val ? (Array.isArray(val) ? JSON.stringify(val) : val) : null);
    }
  },
  actif: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  assujetti: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  created_by: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'tbl_utilisateurs', key: 'id' } }
}, {
  tableName: 'tbl_clients',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['type_client'] },
    { fields: ['email'] },
    { fields: ['telephone'] },
    { fields: ['actif'] },
    { fields: ['raison_sociale'] },
    { fields: ['nom'] },
    { fields: ['ville'] }
  ]
});

Client.prototype.getDisplayName = function() {
  if (this.type_client === 'entreprise' && this.raison_sociale) return this.raison_sociale;
  const parts = [this.nom, this.prenom].filter(Boolean);
  return parts.length ? parts.join(' ') : `Client #${this.id}`;
};

module.exports = Client;

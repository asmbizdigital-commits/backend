const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SoumissionBesoinsLigne = sequelize.define('SoumissionBesoinsLigne', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  soumission_besoins_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'tbl_soumissions_besoins', key: 'id' }
  },
  type_ligne: {
    type: DataTypes.ENUM('article', 'libelle'),
    allowNull: false,
    defaultValue: 'libelle'
  },
  inventaire_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_inventaire', key: 'id' }
  },
  departement_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_departements', key: 'id' }
  },
  libelle: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  montant: {
    type: DataTypes.DECIMAL(14, 2),
    allowNull: true
  },
  quantite: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 1
  },
  prix_unitaire: {
    type: DataTypes.DECIMAL(14, 2),
    allowNull: true
  },
  devise: {
    type: DataTypes.ENUM('EUR', 'USD', 'FC'),
    allowNull: true,
    defaultValue: 'FC'
  }
}, {
  tableName: 'tbl_soumissions_besoins_lignes',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = SoumissionBesoinsLigne;

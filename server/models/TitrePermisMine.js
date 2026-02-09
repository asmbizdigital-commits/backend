const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const TitrePermisMine = sequelize.define('TitrePermisMine', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  operateur_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'tbl_operateurs_mines', key: 'id' }
  },
  numero_titre: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  type_titre: {
    type: DataTypes.ENUM('permis_recherche', 'permis_exploitation', 'concession_miniere', 'autorisation_artisanale', 'autre'),
    allowNull: false,
    defaultValue: 'permis_recherche'
  },
  date_delivrance: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  date_expiration: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  superficie_ha: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true
  },
  zone: {
    type: DataTypes.STRING(150),
    allowNull: true
  },
  statut: {
    type: DataTypes.ENUM('actif', 'expire', 'suspendu', 'en_renouvellement'),
    allowNull: false,
    defaultValue: 'actif'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'tbl_titres_permis_mines',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = TitrePermisMine;

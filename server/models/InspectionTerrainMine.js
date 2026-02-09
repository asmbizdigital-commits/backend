const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const InspectionTerrainMine = sequelize.define('InspectionTerrainMine', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  numero_mission: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  titre: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  date_mission: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  zone_site: {
    type: DataTypes.STRING(150),
    allowNull: true
  },
  operateur_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_operateurs_mines', key: 'id' }
  },
  type_inspection: {
    type: DataTypes.ENUM('routine', 'ciblee', 'suite_plainte', 'autre'),
    allowNull: false,
    defaultValue: 'routine'
  },
  statut: {
    type: DataTypes.ENUM('planifiee', 'en_cours', 'terminee', 'reportee', 'annulee'),
    allowNull: false,
    defaultValue: 'planifiee'
  },
  rapport_texte: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  conclusions: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  recommandations: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  inspecteur_nom: {
    type: DataTypes.STRING(150),
    allowNull: true
  },
  date_rapport: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'tbl_inspections_terrain_mines',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = InspectionTerrainMine;

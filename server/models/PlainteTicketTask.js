const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PlainteTicketTask = sequelize.define('PlainteTicketTask', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  plainte_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'tbl_plaintes', key: 'id' }
  },
  ticket_pro_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'tbl_tickets_pro', key: 'id' }
  },
  task_pro_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'tbl_task_pro', key: 'id' }
  },
  createur_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_utilisateurs', key: 'id' }
  }
}, {
  tableName: 'tbl_plaintes_tickets_tasks',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

module.exports = PlainteTicketTask;

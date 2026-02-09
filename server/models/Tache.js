const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Tache = sequelize.define('Tache', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  titre: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [3, 255]
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  type: {
    type: DataTypes.ENUM('Nettoyage', 'Maintenance', 'Réception', 'Administrative', 'Autre'),
    allowNull: false,
    defaultValue: 'Autre'
  },
  priorite: {
    type: DataTypes.ENUM('Basse', 'Normale', 'Haute', 'Urgente'),
    allowNull: false,
    defaultValue: 'Normale'
  },
  statut: {
    type: DataTypes.ENUM('À faire', 'En cours', 'En attente', 'Terminée', 'Annulée'),
    allowNull: false,
    defaultValue: 'À faire'
  },
  assigne_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'tbl_utilisateurs',
      key: 'id'
    }
  },
  createur_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'tbl_utilisateurs',
      key: 'id'
    }
  },
  chambre_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'tbl_chambres',
      key: 'id'
    }
  },
  problematique_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'tbl_problematiques',
      key: 'id'
    }
  },
  client_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_clients', key: 'id' }
  },
  date_creation: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  date_debut: {
    type: DataTypes.DATE,
    allowNull: true
  },
  date_fin: {
    type: DataTypes.DATE,
    allowNull: true
  },
  date_limite: {
    type: DataTypes.DATE,
    allowNull: true
  },
  duree_estimee: {
    type: DataTypes.INTEGER, // in minutes
    allowNull: true,
    validate: {
      min: 0
    }
  },
  duree_reelle: {
    type: DataTypes.INTEGER, // in minutes
    allowNull: true,
    validate: {
      min: 0
    }
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  tags: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  fichiers: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'tbl_taches',
  indexes: [
    {
      fields: ['statut']
    },
    {
      fields: ['priorite']
    },
    {
      fields: ['type']
    },
    {
      fields: ['assigne_id']
    },
    {
      fields: ['createur_id']
    },
    {
      fields: ['chambre_id']
    },
    {
      fields: ['problematique_id']
    }
  ]
});

// Instance method to check if task is overdue
Tache.prototype.isOverdue = function() {
  if (!this.date_limite) return false;
  return new Date() > new Date(this.date_limite) && this.statut !== 'Terminée';
};

// Instance method to get priority color
Tache.prototype.getPriorityColor = function() {
  const priorityColors = {
    'Basse': 'green',
    'Normale': 'blue',
    'Haute': 'orange',
    'Urgente': 'red'
  };
  return priorityColors[this.priorite] || 'gray';
};

// Instance method to get status color
Tache.prototype.getStatusColor = function() {
  const statusColors = {
    'À faire': 'gray',
    'En cours': 'yellow',
    'En attente': 'orange',
    'Terminée': 'green',
    'Annulée': 'red'
  };
  return statusColors[this.statut] || 'gray';
};

// Instance method to start task
Tache.prototype.startTask = function() {
  this.statut = 'En cours';
  this.date_debut = new Date();
  return this.save();
};

// Instance method to complete task
Tache.prototype.completeTask = function() {
  this.statut = 'Terminée';
  this.date_fin = new Date();
  if (this.date_debut) {
    this.duree_reelle = Math.round((new Date() - new Date(this.date_debut)) / 60000);
  }
  return this.save();
};

module.exports = Tache; 
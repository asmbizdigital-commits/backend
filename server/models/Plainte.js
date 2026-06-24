const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Plainte = sequelize.define('Plainte', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  numero_plainte: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true
    }
  },
  type_plainte: {
    type: DataTypes.ENUM('Interne', 'Externe'),
    allowNull: false,
    validate: {
      isIn: [['Interne', 'Externe']]
    }
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
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  categorie: {
    type: DataTypes.ENUM('Service', 'Qualité', 'Sécurité', 'Ressources Humaines', 'Financier', 'Technique', 'Autre'),
    allowNull: false,
    defaultValue: 'Autre'
  },
  priorite: {
    type: DataTypes.ENUM('Basse', 'Normale', 'Haute', 'Urgente'),
    allowNull: false,
    defaultValue: 'Normale'
  },
  statut: {
    type: DataTypes.ENUM('Nouvelle', 'En cours', 'En attente', 'Résolue', 'Fermée', 'Rejetée'),
    allowNull: false,
    defaultValue: 'Nouvelle'
  },
  // Informations du plaignant (pour plaintes externes)
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
    allowNull: true,
    validate: {
      isEmail: true
    }
  },
  plaignant_telephone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  plaignant_type: {
    type: DataTypes.ENUM('Client', 'Visiteur', 'Fournisseur', 'Autre'),
    allowNull: true
  },
  client_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_clients', key: 'id' }
  },
  // Informations de l'employé plaignant (pour plaintes internes)
  employe_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'tbl_utilisateurs',
      key: 'id'
    }
  },
  // Informations de traitement
  departement_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'tbl_departements',
      key: 'id'
    }
  },
  sous_departement_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'tbl_sous_departements',
      key: 'id'
    }
  },
  zone: {
    type: DataTypes.STRING(30),
    allowNull: true
  },
  direction_provinciale_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'tbl_directions_provinciales',
      key: 'id'
    }
  },
  bureau_international_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'tbl_bureaux_internationaux',
      key: 'id'
    }
  },
  assignee_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'tbl_utilisateurs',
      key: 'id'
    }
  },
  rapporteur_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'tbl_utilisateurs',
      key: 'id'
    }
  },
  // Dates importantes
  date_incident: {
    type: DataTypes.DATE,
    allowNull: true
  },
  date_creation: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  date_assignation: {
    type: DataTypes.DATE,
    allowNull: true
  },
  date_resolution: {
    type: DataTypes.DATE,
    allowNull: true
  },
  date_limite: {
    type: DataTypes.DATE,
    allowNull: true
  },
  date_fermeture: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // Informations de suivi
  resolution: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  actions_correctives: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  satisfaction_client: {
    type: DataTypes.ENUM('Très satisfait', 'Satisfait', 'Neutre', 'Insatisfait', 'Très insatisfait'),
    allowNull: true
  },
  commentaire_satisfaction: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Informations financières
  montant_remboursement: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  type_compensation: {
    type: DataTypes.ENUM('Remboursement', 'Réduction', 'Service gratuit', 'Aucun'),
    allowNull: true
  },
  // Métadonnées
  tags: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const value = this.getDataValue('tags');
      return value ? JSON.parse(value) : null;
    },
    set(value) {
      this.setDataValue('tags', value ? JSON.stringify(value) : null);
    }
  },
  fichiers_joints: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const value = this.getDataValue('fichiers_joints');
      return value ? JSON.parse(value) : null;
    },
    set(value) {
      this.setDataValue('fichiers_joints', value ? JSON.stringify(value) : null);
    }
  },
  notes_internes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  confidentialite: {
    type: DataTypes.ENUM('Public', 'Interne', 'Confidentiel', 'Secret'),
    allowNull: false,
    defaultValue: 'Interne'
  },
  // Statistiques et suivi
  duree_traitement_heures: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  nombre_relances: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  derniere_relance: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // Historique
  historique_statut: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const value = this.getDataValue('historique_statut');
      return value ? JSON.parse(value) : null;
    },
    set(value) {
      this.setDataValue('historique_statut', value ? JSON.stringify(value) : null);
    }
  }
}, {
  tableName: 'tbl_plaintes',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['type_plainte'] },
    { fields: ['statut'] },
    { fields: ['priorite'] },
    { fields: ['categorie'] },
    { fields: ['employe_id'] },
    { fields: ['assignee_id'] },
    { fields: ['rapporteur_id'] },
    { fields: ['departement_id'] },
    { fields: ['zone'] },
    { fields: ['direction_provinciale_id'] },
    { fields: ['bureau_international_id'] },
    { fields: ['date_creation'] },
    { fields: ['date_incident'] },
    { fields: ['plaignant_email'] }
  ]
});

// Instance methods
Plainte.prototype.isUrgent = function() {
  return this.priorite === 'Urgente' || this.priorite === 'Haute';
};

Plainte.prototype.getPriorityColor = function() {
  const priorityColors = {
    'Basse': 'green',
    'Normale': 'blue',
    'Haute': 'orange',
    'Urgente': 'red'
  };
  return priorityColors[this.priorite] || 'gray';
};

Plainte.prototype.getStatusColor = function() {
  const statusColors = {
    'Nouvelle': 'blue',
    'En cours': 'yellow',
    'En attente': 'orange',
    'Résolue': 'green',
    'Fermée': 'gray',
    'Rejetée': 'red'
  };
  return statusColors[this.statut] || 'gray';
};

Plainte.prototype.addStatusHistory = function(userId, oldStatus, newStatus, comment) {
  const history = this.historique_statut || [];
  history.push({
    id: Date.now(),
    user_id: userId,
    old_status: oldStatus,
    new_status: newStatus,
    comment: comment,
    timestamp: new Date().toISOString()
  });
  this.historique_statut = history;
  return this.save();
};

Plainte.prototype.calculateDuration = function() {
  if (this.date_resolution && this.date_creation) {
    const diff = new Date(this.date_resolution) - new Date(this.date_creation);
    this.duree_traitement_heures = Math.round(diff / (1000 * 60 * 60));
    return this.save();
  }
  return Promise.resolve(this);
};

module.exports = Plainte;


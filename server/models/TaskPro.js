const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const TaskPro = sequelize.define('TaskPro', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  numero_tache: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true
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
    allowNull: true
  },
  type_tache: {
    type: DataTypes.ENUM('Tâche', 'Bug', 'Amélioration', 'Fonctionnalité', 'Documentation', 'Maintenance', 'Autre'),
    allowNull: false,
    defaultValue: 'Tâche'
  },
  statut: {
    type: DataTypes.ENUM('À faire', 'En cours', 'En révision', 'Terminé', 'Bloqué', 'Annulé'),
    allowNull: false,
    defaultValue: 'À faire'
  },
  colonne_kanban: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'À faire'
  },
  position: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  priorite: {
    type: DataTypes.ENUM('Basse', 'Normale', 'Haute', 'Urgente'),
    allowNull: false,
    defaultValue: 'Normale'
  },
  urgence: {
    type: DataTypes.ENUM('Faible', 'Moyenne', 'Élevée', 'Critique'),
    allowNull: true,
    defaultValue: 'Moyenne'
  },
  createur_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'tbl_utilisateurs',
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
  assignees: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const value = this.getDataValue('assignees');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('assignees', value ? JSON.stringify(value) : null);
    }
  },
  watchers: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const value = this.getDataValue('watchers');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('watchers', value ? JSON.stringify(value) : null);
    }
  },
  projet_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  projet_nom: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  liste_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  liste_nom: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
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
  date_creation: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  date_debut: {
    type: DataTypes.DATE,
    allowNull: true
  },
  date_echeance: {
    type: DataTypes.DATE,
    allowNull: true
  },
  date_debut_reelle: {
    type: DataTypes.DATE,
    allowNull: true
  },
  date_fin_reelle: {
    type: DataTypes.DATE,
    allowNull: true
  },
  date_fermeture: {
    type: DataTypes.DATE,
    allowNull: true
  },
  estimation_heures: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true
  },
  temps_passe_heures: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0
  },
  progression: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: 0,
      max: 100
    }
  },
  labels: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const value = this.getDataValue('labels');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('labels', value ? JSON.stringify(value) : null);
    }
  },
  couleur: {
    type: DataTypes.STRING(7),
    allowNull: true
  },
  checklist: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const value = this.getDataValue('checklist');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('checklist', value ? JSON.stringify(value) : null);
    }
  },
  dependances: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const value = this.getDataValue('dependances');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('dependances', value ? JSON.stringify(value) : null);
    }
  },
  sous_taches: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const value = this.getDataValue('sous_taches');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('sous_taches', value ? JSON.stringify(value) : null);
    }
  },
  tache_parent_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'tbl_task_pro',
      key: 'id'
    }
  },
  fichiers_joints: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const value = this.getDataValue('fichiers_joints');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('fichiers_joints', value ? JSON.stringify(value) : null);
    }
  },
  liens: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const value = this.getDataValue('liens');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('liens', value ? JSON.stringify(value) : null);
    }
  },
  commentaires: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const value = this.getDataValue('commentaires');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('commentaires', value ? JSON.stringify(value) : null);
    }
  },
  notes_internes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  resolution: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  nombre_comments: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  nombre_attachments: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  nombre_checklist_items: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  checklist_completed: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  vues: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  derniere_vue: {
    type: DataTypes.DATE,
    allowNull: true
  },
  historique: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const value = this.getDataValue('historique');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('historique', value ? JSON.stringify(value) : null);
    }
  },
  activite: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const value = this.getDataValue('activite');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('activite', value ? JSON.stringify(value) : null);
    }
  },
  visibilite: {
    type: DataTypes.ENUM('Public', 'Privé', 'Équipe', 'Département'),
    allowNull: false,
    defaultValue: 'Public'
  },
  confidentialite: {
    type: DataTypes.ENUM('Normale', 'Confidentielle', 'Secrète'),
    allowNull: false,
    defaultValue: 'Normale'
  },
  recurrence: {
    type: DataTypes.ENUM('Aucune', 'Quotidienne', 'Hebdomadaire', 'Mensuelle', 'Annuelle', 'Personnalisée'),
    allowNull: false,
    defaultValue: 'Aucune'
  },
  recurrence_config: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const value = this.getDataValue('recurrence_config');
      return value ? JSON.parse(value) : null;
    },
    set(value) {
      this.setDataValue('recurrence_config', value ? JSON.stringify(value) : null);
    }
  },
  tache_recurrente_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'tbl_task_pro',
      key: 'id'
    }
  },
  rappel_actif: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  rappel_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  notifications: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const value = this.getDataValue('notifications');
      return value ? JSON.parse(value) : {};
    },
    set(value) {
      this.setDataValue('notifications', value ? JSON.stringify(value) : null);
    }
  },
  archive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  date_archivage: {
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
  },
  temps_estime_total: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true
  },
  temps_passe_total: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true
  },
  retard: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  duree_jours: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  custom_fields: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const value = this.getDataValue('custom_fields');
      return value ? JSON.parse(value) : {};
    },
    set(value) {
      this.setDataValue('custom_fields', value ? JSON.stringify(value) : null);
    }
  },
  metadata: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const value = this.getDataValue('metadata');
      return value ? JSON.parse(value) : {};
    },
    set(value) {
      this.setDataValue('metadata', value ? JSON.stringify(value) : null);
    }
  }
}, {
  tableName: 'tbl_task_pro',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['statut'] },
    { fields: ['colonne_kanban'] },
    { fields: ['priorite'] },
    { fields: ['type_tache'] },
    { fields: ['createur_id'] },
    { fields: ['assignee_id'] },
    { fields: ['projet_id'] },
    { fields: ['liste_id'] },
    { fields: ['departement_id'] },
    { fields: ['date_echeance'] },
    { fields: ['tache_parent_id'] },
    { fields: ['archive'] },
    { fields: ['supprime'] },
    { fields: ['colonne_kanban', 'position'] }
  ]
});

// Instance methods
TaskPro.prototype.isOverdue = function() {
  if (!this.date_echeance) return false;
  return new Date(this.date_echeance) < new Date() && this.statut !== 'Terminé';
};

TaskPro.prototype.getPriorityColor = function() {
  const colors = {
    'Basse': '#10b981',
    'Normale': '#3b82f6',
    'Haute': '#f59e0b',
    'Urgente': '#ef4444'
  };
  return colors[this.priorite] || '#6b7280';
};

TaskPro.prototype.getStatusColor = function() {
  const colors = {
    'À faire': '#6b7280',
    'En cours': '#3b82f6',
    'En révision': '#f59e0b',
    'Terminé': '#10b981',
    'Bloqué': '#ef4444',
    'Annulé': '#9ca3af'
  };
  return colors[this.statut] || '#6b7280';
};

TaskPro.prototype.addComment = function(userId, comment, attachments = []) {
  const comments = this.commentaires || [];
  comments.push({
    id: Date.now(),
    user_id: userId,
    comment: comment,
    attachments: attachments,
    timestamp: new Date().toISOString()
  });
  this.commentaires = comments;
  this.nombre_comments = comments.length;
  return this.save();
};

TaskPro.prototype.addToHistory = function(userId, action, details = {}) {
  const history = this.historique || [];
  history.push({
    id: Date.now(),
    user_id: userId,
    action: action,
    details: details,
    timestamp: new Date().toISOString()
  });
  this.historique = history;
  return this.save();
};

TaskPro.prototype.updateChecklist = function() {
  const checklist = this.checklist || [];
  this.nombre_checklist_items = checklist.length;
  this.checklist_completed = checklist.filter(item => item.completed).length;
  if (this.nombre_checklist_items > 0) {
    this.progression = Math.round((this.checklist_completed / this.nombre_checklist_items) * 100);
  }
  return this.save();
};

TaskPro.prototype.calculateDelay = function() {
  if (!this.date_echeance) {
    this.retard = 0;
    return this.save();
  }
  const now = new Date();
  const echeance = new Date(this.date_echeance);
  const diffTime = now - echeance;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  this.retard = diffDays > 0 && this.statut !== 'Terminé' ? diffDays : 0;
  return this.save();
};

module.exports = TaskPro;


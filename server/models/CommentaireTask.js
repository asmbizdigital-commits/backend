const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CommentaireTask = sequelize.define('CommentaireTask', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  task_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'tbl_task_pro',
      key: 'id'
    }
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'tbl_utilisateurs',
      key: 'id'
    }
  },
  commentaire: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 5000]
    }
  },
  commentaire_parent_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'tbl_commentaires_tasks',
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
  nombre_likes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  likes: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const value = this.getDataValue('likes');
      return value ? JSON.parse(value) : [];
    },
    set(value) {
      this.setDataValue('likes', value ? JSON.stringify(value) : null);
    }
  },
  edite: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  date_edition: {
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
  tableName: 'tbl_commentaires_tasks',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['task_id'] },
    { fields: ['user_id'] },
    { fields: ['commentaire_parent_id'] },
    { fields: ['created_at'] },
    { fields: ['supprime'] }
  ]
});

// Instance methods
CommentaireTask.prototype.toggleLike = function(userId) {
  const likes = this.likes || [];
  const index = likes.indexOf(userId);
  
  if (index > -1) {
    likes.splice(index, 1);
    this.nombre_likes = Math.max(0, this.nombre_likes - 1);
  } else {
    likes.push(userId);
    this.nombre_likes = this.nombre_likes + 1;
  }
  
  this.likes = likes;
  return this.save();
};

CommentaireTask.prototype.isLikedBy = function(userId) {
  const likes = this.likes || [];
  return likes.includes(userId);
};

module.exports = CommentaireTask;


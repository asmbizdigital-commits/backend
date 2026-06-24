const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  nom: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [2, 100]
    }
  },
  prenom: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [2, 100]
    }
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  mot_de_passe: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      len: {
        args: [6, 255],
        msg: 'Le mot de passe doit contenir entre 6 et 255 caractères'
      }
    }
  },
  role: {
    type: DataTypes.ENUM(
      'Guichetier',
      'Agent',
      'Web Master',
      'Superviseur Stock',
      'Superviseur Housing',
      'Superviseur Finance',
      'Superviseur RH',
      'Superviseur',
      'Administrateur',
      'Patron',
      'Auditeur',
      'Superviseur Technique',
      'Superviseur Resto',
      'Superviseur Buanderie',
      'Superviseur Comptable',
      'Agent Exterieur',
      'Agent Gouvernant',
      'Agent Chambre',
      'Booker',
      'call_center',
      'Saisisseur',
      'Verificateur Sygrem',
      'Controlleur Sygram',
      'Gestionnaire des Plaintes',
      'Manager Bureau',
      'Directeur Opérations',
      'Directeur Operations'
    ),
    allowNull: false,
    defaultValue: 'Agent'
  },
  telephone: {
    type: DataTypes.STRING(20),
    allowNull: true,
    validate: {
      len: [0, 20]
    }
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
  actif: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  derniere_connexion: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'tbl_utilisateurs',
  hooks: {
    beforeCreate: async (user) => {
      if (user.mot_de_passe) {
        user.mot_de_passe = await bcrypt.hash(user.mot_de_passe, 12);
      }
    },
    beforeUpdate: async (user) => {
      // Si le mot de passe est fourni et qu'il a changé, le hasher
      if (user.changed('mot_de_passe') && user.mot_de_passe && user.mot_de_passe.length >= 6) {
        user.mot_de_passe = await bcrypt.hash(user.mot_de_passe, 12);
      }
      // Si le mot de passe est vide ou trop court, ne pas le modifier
      // Sequelize conservera l'ancienne valeur
    }
  }
});

// Instance method to check password
User.prototype.checkPassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.mot_de_passe);
};

// Instance method to get full name
User.prototype.getFullName = function() {
  return `${this.prenom} ${this.nom}`;
};

// Instance method to check if user has permission
User.prototype.hasPermission = function(requiredRole) {
  const roleHierarchy = {
    'Guichetier': 1,
    'Saisisseur': 2,
    'Verificateur Sygrem': 2,
    'Controlleur Sygram': 2,
    'Gestionnaire des Plaintes': 2,
    'Manager Bureau': 4,
    'Agent': 2,
    'call_center': 2,
    'Web Master': 3,
    'Superviseur Stock': 4,
    'Superviseur Housing': 5,
    'Superviseur Finance': 6,
    'Superviseur RH': 7,
    'Superviseur': 8,
    'Auditeur': 9,
    'Directeur Opérations': 9,
    'Directeur Operations': 9,
    'Administrateur': 10,
    'Patron': 11
  };
  
  return roleHierarchy[this.role] >= roleHierarchy[requiredRole];
};

module.exports = User; 
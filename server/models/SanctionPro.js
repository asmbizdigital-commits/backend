const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SanctionPro = sequelize.define('SanctionPro', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  employe_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'tbl_employes',
      key: 'id'
    },
    comment: 'ID de l\'employé à sanctionner'
  },
  type_sanction: {
    type: DataTypes.ENUM('avertissement_verbal', 'avertissement_ecrit', 'blame', 'mise_a_pied', 'retrogradation', 'licenciement_faute_grave'),
    allowNull: false,
    defaultValue: 'avertissement_verbal',
    comment: 'Type de sanction selon le Code du Travail RDC'
  },
  motif: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [10, 2000]
    },
    comment: 'Motif détaillé de la sanction'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Description détaillée des faits reprochés'
  },
  date_incident: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    validate: {
      isDate: true
    },
    comment: 'Date de l\'incident ou du manquement'
  },
  duree_suspension: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 1,
      max: 8 // Maximum 8 jours selon Code du Travail RDC
    },
    comment: 'Durée de suspension en jours (pour mise à pied, max 8 jours)'
  },
  date_debut_suspension: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    validate: {
      isDate: true
    },
    comment: 'Date de début de suspension'
  },
  date_fin_suspension: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    validate: {
      isDate: true
    },
    comment: 'Date de fin de suspension'
  },
  montant_amende: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    validate: {
      min: 0
    },
    comment: 'Montant de l\'amende en FC (si applicable)'
  },
  statut: {
    type: DataTypes.ENUM('en_attente', 'approuve', 'rejete', 'annule'),
    allowNull: false,
    defaultValue: 'en_attente',
    comment: 'Statut de la demande'
  },
  date_validation: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Date de validation/rejet par le Responsable RH'
  },
  commentaire_rh: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Commentaire du Responsable RH'
  },
  demandeur_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'tbl_utilisateurs',
      key: 'id'
    },
    comment: 'ID du Superviseur (chef de département) qui fait la demande'
  },
  validateur_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'tbl_utilisateurs',
      key: 'id'
    },
    comment: 'ID du Superviseur RH qui valide/rejette'
  },
  documents: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Documents justificatifs (pièces jointes)'
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'tbl_sanctions_pro',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  comment: 'Table des demandes de sanctions disciplinaires (workflow d\'approbation)',
  indexes: [
    {
      fields: ['employe_id']
    },
    {
      fields: ['type_sanction']
    },
    {
      fields: ['statut']
    },
    {
      fields: ['demandeur_id']
    },
    {
      fields: ['validateur_id']
    },
    {
      fields: ['date_incident']
    },
    {
      fields: ['created_at']
    }
  ],
  hooks: {
    beforeValidate: (sanction) => {
      // Calculer automatiquement la date de fin de suspension pour les mises à pied
      if (sanction.type_sanction === 'mise_a_pied' && sanction.duree_suspension && sanction.date_debut_suspension) {
        const dateDebut = new Date(sanction.date_debut_suspension);
        const dateFin = new Date(dateDebut);
        dateFin.setDate(dateFin.getDate() + sanction.duree_suspension);
        sanction.date_fin_suspension = dateFin.toISOString().split('T')[0];
      }
    }
  }
});

module.exports = SanctionPro;

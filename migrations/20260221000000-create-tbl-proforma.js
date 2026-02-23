'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('tbl_proforma', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      numero: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      client_nom: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      client_email: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      client_adresse: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      client_telephone: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      date_proforma: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      date_echeance: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      statut: {
        type: Sequelize.ENUM('brouillon', 'envoyee', 'convertie', 'annulee'),
        allowNull: false,
        defaultValue: 'brouillon'
      },
      total_ht: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      total_tva: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      total_ttc: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      devise: {
        type: Sequelize.STRING(5),
        allowNull: false,
        defaultValue: 'FC'
      },
      template_code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'modern'
      },
      remarques: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      facture_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Facture créée après conversion'
      },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    });
    await queryInterface.addIndex('tbl_proforma', ['numero'], { name: 'idx_proforma_numero' });
    await queryInterface.addIndex('tbl_proforma', ['client_id'], { name: 'idx_proforma_client' });
    await queryInterface.addIndex('tbl_proforma', ['date_proforma'], { name: 'idx_proforma_date' });
    await queryInterface.addIndex('tbl_proforma', ['statut'], { name: 'idx_proforma_statut' });

    await queryInterface.createTable('tbl_proforma_lignes', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      proforma_id: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      compte_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      libelle: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      quantite: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 1
      },
      prix_unitaire: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      montant_ht: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      taux_tva: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0
      },
      montant_ttc: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      ordre: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });
    await queryInterface.addIndex('tbl_proforma_lignes', ['proforma_id'], { name: 'idx_proforma_lignes_proforma' });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('tbl_proforma_lignes');
    await queryInterface.dropTable('tbl_proforma');
  }
};

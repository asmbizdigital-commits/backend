'use strict';

/** Création de tbl_contentieux_dossiers (contentieux liés aux dossiers FERI). */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.showAllTables();
    const normalized = tables.map((t) => String(t).toLowerCase());
    if (normalized.includes('tbl_contentieux_dossiers')) {
      return;
    }

    await queryInterface.createTable('tbl_contentieux_dossiers', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      connaissement_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true
      },
      numero_dossier: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      bl_number: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      saisisseur_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'tbl_utilisateurs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      saisisseur_nom: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      cree_par_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'tbl_utilisateurs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      statut: {
        type: Sequelize.ENUM('Nouveau', 'En cours', 'Clôturé', 'Annulé'),
        allowNull: false,
        defaultValue: 'Nouveau'
      },
      commentaire: {
        type: Sequelize.TEXT,
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

    await queryInterface.addIndex('tbl_contentieux_dossiers', ['numero_dossier'], {
      name: 'idx_contentieux_numero_dossier'
    });
    await queryInterface.addIndex('tbl_contentieux_dossiers', ['cree_par_id'], {
      name: 'idx_contentieux_cree_par'
    });
    await queryInterface.addIndex('tbl_contentieux_dossiers', ['statut'], {
      name: 'idx_contentieux_statut'
    });
    await queryInterface.addIndex('tbl_contentieux_dossiers', ['created_at'], {
      name: 'idx_contentieux_created_at'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('tbl_contentieux_dossiers');
  }
};

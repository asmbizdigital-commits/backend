'use strict';

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(
      'ALTER TABLE tbl_encaissements MODIFY COLUMN user_guichet_id INT NULL'
    );
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(
      'ALTER TABLE tbl_encaissements MODIFY COLUMN user_guichet_id INT NOT NULL'
    );
  }
};

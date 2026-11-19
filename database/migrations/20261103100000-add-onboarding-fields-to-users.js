'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'kyc_status', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'not_started',
    });
    await queryInterface.addColumn('users', 'password_set_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'password_set_at');
    await queryInterface.removeColumn('users', 'kyc_status');
  },
};

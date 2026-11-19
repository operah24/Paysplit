'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const crypto = require('crypto');
    const now = new Date();

    const roles = [
      { name: 'user', display_name: 'User' },
      { name: 'admin', display_name: 'Admin' },
      { name: 'super_admin', display_name: 'Super Admin' },
    ].map((r) => ({ id: crypto.randomUUID(), ...r, created_at: now, updated_at: now }));

    await queryInterface.bulkInsert('roles', roles, {});
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('roles', { name: ['user', 'admin', 'super_admin'] }, {});
  },
};

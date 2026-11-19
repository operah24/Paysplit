'use strict';

/**
 * Audit trail: one row per KYC submission. Never stores images or ID numbers.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('kyc_attempts', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      step: { type: Sequelize.STRING, allowNull: false },
      method: { type: Sequelize.STRING, allowNull: true },
      outcome: { type: Sequelize.STRING, allowNull: false },
      reason: { type: Sequelize.STRING, allowNull: true },
      checks: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex('kyc_attempts', ['user_id', 'step', 'created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('kyc_attempts');
  },
};

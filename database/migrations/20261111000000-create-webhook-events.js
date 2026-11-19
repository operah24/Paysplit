'use strict';

/**
 * Incoming webhook events (HePaid). One row per provider event id, so retries
 * and resends (same id) are processed once.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('webhook_events', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      provider: { type: Sequelize.STRING(20), allowNull: false },
      // The provider's event id (HePaid-Event-Id).
      event_id: { type: Sequelize.STRING(100), allowNull: false },
      type: { type: Sequelize.STRING(60), allowNull: false },
      // Test | Live
      mode: { type: Sequelize.STRING(10), allowNull: true },
      // received | processed | ignored | failed
      status: { type: Sequelize.STRING(20), allowNull: false },
      // Why it was ignored or failed.
      note: { type: Sequelize.STRING(300), allowNull: true },
      attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      processed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('webhook_events', ['provider', 'event_id'], {
      unique: true,
      name: 'webhook_events_provider_event_unique',
    });
    await queryInterface.addIndex('webhook_events', ['created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('webhook_events');
  },
};

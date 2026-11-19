'use strict';

/**
 * Settings & sessions:
 * - users.token_version: bumped on logout / password change / reset to revoke
 *   every access token issued before it.
 * - users.notification_preferences: per-channel toggles (null = defaults).
 * - notifications: in-app notification feed (bell + dashboard banner).
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'token_version', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('users', 'notification_preferences', {
      type: Sequelize.JSONB,
      allowNull: true,
    });

    await queryInterface.createTable('notifications', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      type: { type: Sequelize.STRING(40), allowNull: false },
      title: { type: Sequelize.STRING(120), allowNull: false },
      body: { type: Sequelize.STRING(500), allowNull: false },
      data: { type: Sequelize.JSONB, allowNull: true },
      read_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('notifications', ['user_id', 'created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notifications');
    await queryInterface.removeColumn('users', 'notification_preferences');
    await queryInterface.removeColumn('users', 'token_version');
  },
};

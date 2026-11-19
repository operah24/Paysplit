'use strict';

/**
 * Admin audit trail (PRD FR-29 / FR-33): sign-ins, password and profile
 * changes, and views of customer detail and identity data. Append-only.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('admin_audit_logs', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      admin_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        // Keep the trail: an admin with audit history can't be hard-deleted.
        onDelete: 'RESTRICT',
      },
      action: { type: Sequelize.STRING(60), allowNull: false },
      target_type: { type: Sequelize.STRING(40), allowNull: true },
      target_id: { type: Sequelize.UUID, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: true },
      ip_address: { type: Sequelize.STRING(64), allowNull: true },
      user_agent: { type: Sequelize.STRING(512), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('admin_audit_logs', ['admin_id', 'created_at']);
    await queryInterface.addIndex('admin_audit_logs', ['target_type', 'target_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('admin_audit_logs');
  },
};

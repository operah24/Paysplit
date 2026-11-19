'use strict';

const timestamps = (Sequelize) => ({
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
  deleted_at: { type: Sequelize.DATE, allowNull: true },
});

const userFk = (Sequelize) => ({
  type: Sequelize.UUID,
  allowNull: false,
  references: { model: 'users', key: 'id' },
  onUpdate: 'CASCADE',
  onDelete: 'CASCADE',
});

const categoryFk = (Sequelize) => ({
  type: Sequelize.UUID,
  allowNull: false,
  references: { model: 'categories', key: 'id' },
  onUpdate: 'CASCADE',
  onDelete: 'RESTRICT',
});

/**
 * Setup checklist tables: salary profile, budget wallets, beneficiaries and
 * split rules. All amounts are BIGINT minor units (kobo).
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('salary_profiles', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: { ...userFk(Sequelize), unique: true },
      employer_name: { type: Sequelize.STRING(120), allowNull: false },
      monthly_amount: { type: Sequelize.BIGINT, allowNull: false },
      currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'NGN' },
      // 1-31. In shorter months the payday falls on the last day of the month.
      payday_day: { type: Sequelize.SMALLINT, allowNull: false },
      ...timestamps(Sequelize),
    });

    await queryInterface.createTable('wallets', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: userFk(Sequelize),
      name: { type: Sequelize.STRING(60), allowNull: false },
      category_id: categoryFk(Sequelize),
      accent_color: { type: Sequelize.STRING(20), allowNull: false },
      // Null = "No targeted amount".
      target_amount: { type: Sequelize.BIGINT, allowNull: true },
      currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'NGN' },
      ...timestamps(Sequelize),
    });
    await queryInterface.addIndex('wallets', ['user_id']);
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX wallets_user_name_unique
         ON wallets (user_id, lower(name)) WHERE deleted_at IS NULL`,
    );

    await queryInterface.createTable('beneficiaries', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: userFk(Sequelize),
      bank_code: { type: Sequelize.STRING(20), allowNull: false },
      bank_name: { type: Sequelize.STRING(120), allowNull: false },
      account_number: { type: Sequelize.STRING(10), allowNull: false },
      // Exactly as returned by name enquiry — transfers are rejected otherwise.
      account_name: { type: Sequelize.STRING(200), allowNull: false },
      category_id: categoryFk(Sequelize),
      narration: { type: Sequelize.STRING(100), allowNull: true },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'active' },
      ...timestamps(Sequelize),
    });
    await queryInterface.addIndex('beneficiaries', ['user_id']);
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX beneficiaries_user_account_unique
         ON beneficiaries (user_id, bank_code, account_number) WHERE deleted_at IS NULL`,
    );

    await queryInterface.createTable('split_rules', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: userFk(Sequelize),
      name: { type: Sequelize.STRING(80), allowNull: false },
      // Lower runs first.
      priority: { type: Sequelize.INTEGER, allowNull: false },
      destination_type: { type: Sequelize.STRING(20), allowNull: false },
      wallet_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'wallets', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      beneficiary_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'beneficiaries', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      method: { type: Sequelize.STRING(20), allowNull: false },
      // Fixed rules: kobo. Percentage rules: null.
      fixed_amount: { type: Sequelize.BIGINT, allowNull: true },
      // Percentage rules: basis points (15% = 1500). Fixed rules: null.
      percentage_bps: { type: Sequelize.INTEGER, allowNull: true },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'active' },
      ...timestamps(Sequelize),
    });
    await queryInterface.addIndex('split_rules', ['user_id', 'priority']);
    // One rule per destination ("Linked Rule" on the wallet / beneficiary screens).
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX split_rules_wallet_unique
         ON split_rules (wallet_id) WHERE wallet_id IS NOT NULL AND deleted_at IS NULL`,
    );
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX split_rules_beneficiary_unique
         ON split_rules (beneficiary_id) WHERE beneficiary_id IS NOT NULL AND deleted_at IS NULL`,
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE split_rules ADD CONSTRAINT split_rules_destination_check CHECK (
         (destination_type = 'wallet' AND wallet_id IS NOT NULL AND beneficiary_id IS NULL) OR
         (destination_type = 'beneficiary' AND beneficiary_id IS NOT NULL AND wallet_id IS NULL))`,
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE split_rules ADD CONSTRAINT split_rules_value_check CHECK (
         (method = 'fixed' AND fixed_amount > 0 AND percentage_bps IS NULL) OR
         (method = 'percentage' AND percentage_bps BETWEEN 1 AND 10000 AND fixed_amount IS NULL))`,
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('split_rules');
    await queryInterface.dropTable('beneficiaries');
    await queryInterface.dropTable('wallets');
    await queryInterface.dropTable('salary_profiles');
  },
};

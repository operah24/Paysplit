'use strict';

/**
 * Double-entry ledger.
 *
 * - ledger_accounts: one salary account per user, one per budget wallet, plus
 *   system accounts (user_id NULL) such as incoming-funds and payout clearing.
 * - ledger_transactions: one row per money movement (what users see in
 *   Transactions), with the PAY-YYYYMMDD-XXXXXX reference.
 * - ledger_entries: the signed legs of each transaction. Legs always sum to 0.
 *
 * Amounts are BIGINT minor units (kobo).
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ledger_accounts', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      // salary | wallet | system
      type: { type: Sequelize.STRING(20), allowNull: false },
      // System accounts only (e.g. external_inflow, payout_clearing).
      code: { type: Sequelize.STRING(40), allowNull: true },
      wallet_id: {
        type: Sequelize.UUID,
        allowNull: true,
        unique: true,
        references: { model: 'wallets', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'NGN' },
      balance: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX ledger_accounts_salary_unique
         ON ledger_accounts (user_id, currency) WHERE type = 'salary'`,
    );
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX ledger_accounts_system_unique
         ON ledger_accounts (code, currency) WHERE type = 'system'`,
    );
    // User money can never go negative; system accounts can.
    await queryInterface.sequelize.query(
      `ALTER TABLE ledger_accounts ADD CONSTRAINT ledger_accounts_non_negative
         CHECK (type = 'system' OR balance >= 0)`,
    );

    await queryInterface.createTable('ledger_transactions', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      reference: { type: Sequelize.STRING(40), allowNull: false, unique: true },
      // salary_credit | wallet_allocation | beneficiary_payout | wallet_withdrawal
      type: { type: Sequelize.STRING(30), allowNull: false },
      // pending | success | failed | reversed
      status: { type: Sequelize.STRING(20), allowNull: false },
      amount: { type: Sequelize.BIGINT, allowNull: false },
      fee: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
      currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'NGN' },
      category_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'categories', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      wallet_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'wallets', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      beneficiary_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'beneficiaries', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      split_rule_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'split_rules', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      // Groups the transactions produced by one split run (salary credit or Run Now).
      split_run_id: { type: Sequelize.UUID, allowNull: true },
      // Sender (credits) or recipient (payouts) name.
      counterparty_name: { type: Sequelize.STRING(200), allowNull: true },
      narration: { type: Sequelize.STRING(200), allowNull: true },
      // Payment provider's reference (HePaid transfer / credit reference).
      provider_reference: { type: Sequelize.STRING(120), allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: true },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('ledger_transactions', ['user_id', 'created_at']);
    await queryInterface.addIndex('ledger_transactions', ['wallet_id', 'created_at']);
    await queryInterface.addIndex('ledger_transactions', ['beneficiary_id', 'created_at']);
    await queryInterface.addIndex('ledger_transactions', ['split_rule_id']);
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX ledger_transactions_provider_reference_unique
         ON ledger_transactions (provider_reference) WHERE provider_reference IS NOT NULL`,
    );

    await queryInterface.createTable('ledger_entries', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      transaction_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'ledger_transactions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      account_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'ledger_accounts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      // Signed: positive credits the account, negative debits it.
      amount: { type: Sequelize.BIGINT, allowNull: false },
      balance_after: { type: Sequelize.BIGINT, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('ledger_entries', ['transaction_id']);
    await queryInterface.addIndex('ledger_entries', ['account_id', 'created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ledger_entries');
    await queryInterface.dropTable('ledger_transactions');
    await queryInterface.dropTable('ledger_accounts');
  },
};

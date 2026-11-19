'use strict';

/**
 * Phase 3 (HePaid money flow).
 *
 * - salary_accounts: the user's dedicated HePaid wallet (one per user), issued
 *   after KYC approval. `accounts` holds the funding account numbers HePaid
 *   returns (e.g. Wema + Sterling).
 * - split_runs: one row per split execution (automatic on a salary credit, or
 *   Run Now). Its ledger transactions point back via ledger_transactions.split_run_id.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('salary_accounts', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      provider: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'hepaid' },
      // Our wallet reference at HePaid (ps-<userId>[-<n>]); also the idempotency key.
      provider_reference: { type: Sequelize.STRING(80), allowNull: false, unique: true },
      provider_wallet_id: { type: Sequelize.STRING(80), allowNull: true },
      // Test | Live
      mode: { type: Sequelize.STRING(10), allowNull: true },
      // pending | active | failed | closed
      status: { type: Sequelize.STRING(20), allowNull: false },
      account_name: { type: Sequelize.STRING(200), allowNull: true },
      // [{ bankCode, bankName, accountNumber, accountName }]
      accounts: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      // None | Bvn | Nin
      identity_type: { type: Sequelize.STRING(10), allowNull: true },
      failure_reason: { type: Sequelize.STRING(300), allowNull: true },
      // Creation attempts that HePaid answered with a Failed wallet (each uses a new reference).
      attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      // Retries after network/5xx errors (same reference).
      retry_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      last_attempt_at: { type: Sequelize.DATE, allowNull: true },
      activated_at: { type: Sequelize.DATE, allowNull: true },
      credits_synced_at: { type: Sequelize.DATE, allowNull: true },
      reconciled_at: { type: Sequelize.DATE, allowNull: true },
      // HePaid balance − ledger balance at the last reconciliation, kobo.
      reconciliation_diff: { type: Sequelize.BIGINT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('salary_accounts', ['status']);

    await queryInterface.createTable('split_runs', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      // auto | manual
      trigger: { type: Sequelize.STRING(10), allowNull: false },
      // The salary credit that started an automatic run.
      credit_transaction_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'ledger_transactions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      // processing | completed | partial | failed
      status: { type: Sequelize.STRING(20), allowNull: false },
      // Amount percentage rules apply to, kobo.
      base_amount: { type: Sequelize.BIGINT, allowNull: false },
      // Salary account balance when the run started, kobo.
      available_amount: { type: Sequelize.BIGINT, allowNull: false },
      to_wallets: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
      to_beneficiaries: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
      fees: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
      // [{ ruleId, ruleName, amount, reason }]
      skipped: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('split_runs', ['user_id', 'created_at']);
    // One automatic run per salary credit.
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX split_runs_credit_unique
         ON split_runs (credit_transaction_id) WHERE credit_transaction_id IS NOT NULL`,
    );

    await queryInterface.addConstraint('ledger_transactions', {
      fields: ['split_run_id'],
      type: 'foreign key',
      name: 'ledger_transactions_split_run_id_fkey',
      references: { table: 'split_runs', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addIndex('ledger_transactions', ['split_run_id']);
    // Payout sync scans pending payouts.
    await queryInterface.sequelize.query(
      `CREATE INDEX ledger_transactions_pending_idx
         ON ledger_transactions (type, created_at) WHERE status = 'pending'`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS ledger_transactions_pending_idx');
    await queryInterface.removeIndex('ledger_transactions', ['split_run_id']);
    await queryInterface.removeConstraint(
      'ledger_transactions',
      'ledger_transactions_split_run_id_fkey',
    );
    await queryInterface.dropTable('split_runs');
    await queryInterface.dropTable('salary_accounts');
  },
};

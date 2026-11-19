'use strict';

/**
 * A BVN/NIN added after KYC approval, used only to issue the HePaid salary
 * account (HePaid needs a BVN or NIN). For users who verified with a passport or
 * driver's licence, or whose salary account failed. The original KYC fields are
 * left untouched.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('kyc_verifications', 'wallet_id_method', {
      // bvn | nin
      type: Sequelize.STRING(10),
      allowNull: true,
    });
    await queryInterface.addColumn('kyc_verifications', 'wallet_id_encrypted', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('kyc_verifications', 'wallet_id_last4', {
      type: Sequelize.STRING(4),
      allowNull: true,
    });
    await queryInterface.addColumn('kyc_verifications', 'wallet_id_fingerprint', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addColumn('kyc_verifications', 'wallet_id_verified_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX kyc_verifications_wallet_id_fingerprint_unique
         ON kyc_verifications (wallet_id_fingerprint) WHERE wallet_id_fingerprint IS NOT NULL`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS kyc_verifications_wallet_id_fingerprint_unique',
    );
    for (const column of [
      'wallet_id_verified_at',
      'wallet_id_fingerprint',
      'wallet_id_last4',
      'wallet_id_encrypted',
      'wallet_id_method',
    ]) {
      await queryInterface.removeColumn('kyc_verifications', column);
    }
  },
};

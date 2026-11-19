'use strict';

/**
 * OTP codes are now stored as an HMAC (code_hash) instead of plain text, and
 * wrong guesses are counted per code. Existing rows hold plain-text codes that
 * can no longer be verified, so they are discarded.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('otps', {}, {});
    await queryInterface.renameColumn('otps', 'code', 'code_hash');
    await queryInterface.addColumn('otps', 'attempts', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('otps', {}, {});
    await queryInterface.removeColumn('otps', 'attempts');
    await queryInterface.renameColumn('otps', 'code_hash', 'code');
  },
};

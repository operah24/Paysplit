'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('kyc_verifications', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      provider: { type: Sequelize.STRING, allowNull: false, defaultValue: 'dojah' },
      region: { type: Sequelize.STRING, allowNull: true },
      method: { type: Sequelize.STRING, allowNull: true },
      identity_status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'not_started' },
      liveness_status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'not_started' },
      id_number_encrypted: { type: Sequelize.TEXT, allowNull: true },
      id_number_last4: { type: Sequelize.STRING(4), allowNull: true },
      id_fingerprint: { type: Sequelize.STRING(64), allowNull: true },
      // Temporary: encrypted ID document image, kept only until the liveness face
      // comparison has run, then cleared.
      document_image_encrypted: { type: Sequelize.TEXT, allowNull: true },
      legal_first_name: { type: Sequelize.STRING, allowNull: true },
      legal_last_name: { type: Sequelize.STRING, allowNull: true },
      date_of_birth: { type: Sequelize.STRING, allowNull: true },
      name_match_score: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      face_match_score: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      liveness_score: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      failure_reason: { type: Sequelize.STRING, allowNull: true },
      approved_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });

    // One government ID can only back one approved PaySplit account.
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX kyc_verifications_approved_fingerprint_unique
         ON kyc_verifications (id_fingerprint)
         WHERE approved_at IS NOT NULL AND deleted_at IS NULL`,
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('kyc_verifications');
  },
};

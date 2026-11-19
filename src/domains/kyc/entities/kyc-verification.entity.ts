import { Table, Column, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { BaseEntity } from '../../../core/base.entity';
import { User } from '../../users/entities/user.entity';
import type { KycStoredMethod, KycStoredRegion, KycStepStatus } from '../constants/kyc.constants';

@Table({ tableName: 'kyc_verifications' })
export class KycVerification extends BaseEntity<KycVerification> {
  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, unique: true, field: 'user_id' })
  declare userId: string;

  @BelongsTo(() => User)
  declare user?: User;

  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'dojah' })
  declare provider: string;

  @Column({ type: DataType.STRING, allowNull: true })
  declare region: KycStoredRegion | null;

  @Column({ type: DataType.STRING, allowNull: true })
  declare method: KycStoredMethod | null;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    defaultValue: 'not_started',
    field: 'identity_status',
  })
  declare identityStatus: KycStepStatus;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    defaultValue: 'not_started',
    field: 'liveness_status',
  })
  declare livenessStatus: KycStepStatus;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'id_number_encrypted' })
  declare idNumberEncrypted: string | null;

  @Column({ type: DataType.STRING(4), allowNull: true, field: 'id_number_last4' })
  declare idNumberLast4: string | null;

  @Column({ type: DataType.STRING(64), allowNull: true, field: 'id_fingerprint' })
  declare idFingerprint: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'document_image_encrypted' })
  declare documentImageEncrypted: string | null;

  @Column({ type: DataType.STRING, allowNull: true, field: 'legal_first_name' })
  declare legalFirstName: string | null;

  @Column({ type: DataType.STRING, allowNull: true, field: 'legal_last_name' })
  declare legalLastName: string | null;

  @Column({ type: DataType.STRING, allowNull: true, field: 'date_of_birth' })
  declare dateOfBirth: string | null;

  @Column({ type: DataType.DECIMAL(5, 2), allowNull: true, field: 'name_match_score' })
  declare nameMatchScore: number | null;

  @Column({ type: DataType.DECIMAL(5, 2), allowNull: true, field: 'face_match_score' })
  declare faceMatchScore: number | null;

  @Column({ type: DataType.DECIMAL(5, 2), allowNull: true, field: 'liveness_score' })
  declare livenessScore: number | null;

  @Column({ type: DataType.STRING, allowNull: true, field: 'failure_reason' })
  declare failureReason: string | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'approved_at' })
  declare approvedAt: Date | null;

  @Column({ type: DataType.STRING(10), allowNull: true, field: 'wallet_id_method' })
  declare walletIdMethod: 'bvn' | 'nin' | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'wallet_id_encrypted' })
  declare walletIdEncrypted: string | null;

  @Column({ type: DataType.STRING(4), allowNull: true, field: 'wallet_id_last4' })
  declare walletIdLast4: string | null;

  @Column({ type: DataType.STRING(64), allowNull: true, field: 'wallet_id_fingerprint' })
  declare walletIdFingerprint: string | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'wallet_id_verified_at' })
  declare walletIdVerifiedAt: Date | null;
}

import { Table, Column, DataType, ForeignKey, BelongsTo, HasOne } from 'sequelize-typescript';
import { BaseEntity } from '../../../core/base.entity';
import { Role } from './role.entity';
import type { KycStatus } from '../constants/kyc-status.constants';
import { KycVerification } from '../../kyc/entities/kyc-verification.entity';
import type { NotificationPreferences } from '../constants/notification-preferences.constants';

@Table({ tableName: 'users' })
export class User extends BaseEntity<User> {
  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  declare email: string;

  @Column({ type: DataType.STRING, allowNull: false, field: 'first_name' })
  declare firstName: string;

  @Column({ type: DataType.STRING, allowNull: false, field: 'last_name' })
  declare lastName: string;

  @Column({ type: DataType.STRING, allowNull: true })
  declare password?: string;

  @Column({ type: DataType.STRING, allowNull: true, field: 'phone_number' })
  declare phoneNumber?: string | null;

  @Column({ type: DataType.STRING(2), allowNull: true, field: 'country_code' })
  declare countryCode?: string | null;

  @Column({ type: DataType.STRING(3), allowNull: true, field: 'currency_code' })
  declare currencyCode?: string | null;

  @Column({ type: DataType.STRING(512), allowNull: true, field: 'profile_image_url' })
  declare profileImageUrl?: string | null;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
    allowNull: false,
    field: 'is_email_verified',
  })
  declare isEmailVerified: boolean;

  @Column({ type: DataType.DATE, allowNull: true, field: 'password_set_at' })
  declare passwordSetAt?: Date | null;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    defaultValue: 'not_started',
    field: 'kyc_status',
  })
  declare kycStatus: KycStatus;

  @Column({ type: DataType.BOOLEAN, defaultValue: true, allowNull: false, field: 'is_active' })
  declare isActive: boolean;

  @ForeignKey(() => Role)
  @Column({ type: DataType.UUID, allowNull: true, field: 'role_id' })
  declare roleId?: string;

  @BelongsTo(() => Role)
  declare role?: Role;

  @Column({ type: DataType.DATE, allowNull: true, field: 'last_login_at' })
  declare lastLoginAt?: Date | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'deactivated_at' })
  declare deactivatedAt?: Date | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0, field: 'token_version' })
  declare tokenVersion: number;

  @Column({ type: DataType.JSONB, allowNull: true, field: 'notification_preferences' })
  declare notificationPreferences?: NotificationPreferences | null;

  @HasOne(() => KycVerification)
  declare kycVerification?: KycVerification | null;

  override toJSON(): Record<string, unknown> {
    const values = { ...(this.get() as unknown as Record<string, unknown>) };
    delete values['password'];
    delete values['tokenVersion'];
    delete values['notificationPreferences'];

    delete values['kycVerification'];
    values['role'] = this.role?.name ?? null;
    return values;
  }
}

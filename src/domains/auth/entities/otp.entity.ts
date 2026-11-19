import { Table, Column, DataType } from 'sequelize-typescript';
import { BaseEntity } from '../../../core/base.entity';

@Table({ tableName: 'otps' })
export class Otp extends BaseEntity<Otp> {
  @Column({ type: DataType.STRING, allowNull: false })
  declare email: string;

  @Column({ type: DataType.STRING, allowNull: false, field: 'code_hash' })
  declare codeHash: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare type: string;

  @Column({ type: DataType.DATE, allowNull: false, field: 'otp_expires_at' })
  declare otpExpiresAt: Date;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_verified' })
  declare isVerified: boolean;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare attempts: number;
}

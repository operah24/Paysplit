import {
  Table,
  Column,
  DataType,
  Model,
  PrimaryKey,
  Default,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { MoneyColumn } from '../../../core/money-column.decorator';
import { User } from '../../users/entities/user.entity';

export type SalaryAccountRecordStatus = 'pending' | 'active' | 'failed' | 'closed' | 'not_eligible';

export interface FundingAccount {
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
}

@Table({ tableName: 'salary_accounts' })
export class SalaryAccount extends Model<SalaryAccount> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, unique: true, field: 'user_id' })
  declare userId: string;

  @BelongsTo(() => User)
  declare user?: User;

  @Column({ type: DataType.STRING(20), allowNull: false, defaultValue: 'hepaid' })
  declare provider: string;

  @Column({
    type: DataType.STRING(80),
    allowNull: false,
    unique: true,
    field: 'provider_reference',
  })
  declare providerReference: string;

  @Column({ type: DataType.STRING(80), allowNull: true, field: 'provider_wallet_id' })
  declare providerWalletId: string | null;

  @Column({ type: DataType.STRING(10), allowNull: true })
  declare mode: 'Test' | 'Live' | null;

  @Column({ type: DataType.STRING(20), allowNull: false })
  declare status: SalaryAccountRecordStatus;

  @Column({ type: DataType.STRING(200), allowNull: true, field: 'account_name' })
  declare accountName: string | null;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: [] })
  declare accounts: FundingAccount[];

  @Column({ type: DataType.STRING(10), allowNull: true, field: 'identity_type' })
  declare identityType: 'None' | 'Bvn' | 'Nin' | null;

  @Column({ type: DataType.STRING(300), allowNull: true, field: 'failure_reason' })
  declare failureReason: string | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare attempts: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0, field: 'retry_count' })
  declare retryCount: number;

  @Column({ type: DataType.DATE, allowNull: true, field: 'last_attempt_at' })
  declare lastAttemptAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'activated_at' })
  declare activatedAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'credits_synced_at' })
  declare creditsSyncedAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'reconciled_at' })
  declare reconciledAt: Date | null;

  @MoneyColumn({ field: 'reconciliation_diff', allowNull: true })
  declare reconciliationDiff: number | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}

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
import { LedgerTransaction } from '../../ledger/entities/ledger-transaction.entity';
import type {
  SplitRunStatus,
  SplitRunTrigger,
  SplitSkipReason,
} from '../constants/split-engine.constants';

export interface SkippedRule {
  ruleId: string;
  ruleName: string;

  amount: number;
  reason: SplitSkipReason;
}

@Table({ tableName: 'split_runs' })
export class SplitRun extends Model<SplitRun> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, field: 'user_id' })
  declare userId: string;

  @Column({ type: DataType.STRING(10), allowNull: false })
  declare trigger: SplitRunTrigger;

  @ForeignKey(() => LedgerTransaction)
  @Column({ type: DataType.UUID, allowNull: true, field: 'credit_transaction_id' })
  declare creditTransactionId: string | null;

  @BelongsTo(() => LedgerTransaction, 'creditTransactionId')
  declare creditTransaction?: LedgerTransaction | null;

  @Column({ type: DataType.STRING(20), allowNull: false })
  declare status: SplitRunStatus;

  @MoneyColumn({ field: 'base_amount' })
  declare baseAmount: number;

  @MoneyColumn({ field: 'available_amount' })
  declare availableAmount: number;

  @MoneyColumn({ field: 'to_wallets', defaultValue: 0 })
  declare toWallets: number;

  @MoneyColumn({ field: 'to_beneficiaries', defaultValue: 0 })
  declare toBeneficiaries: number;

  @MoneyColumn({ field: 'fees', defaultValue: 0 })
  declare fees: number;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: [] })
  declare skipped: SkippedRule[];

  @Column({ type: DataType.DATE, allowNull: true, field: 'completed_at' })
  declare completedAt: Date | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}

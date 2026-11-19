import {
  Table,
  Column,
  DataType,
  Model,
  PrimaryKey,
  Default,
  ForeignKey,
  BelongsTo,
  HasMany,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { MoneyColumn } from '../../../core/money-column.decorator';
import { User } from '../../users/entities/user.entity';
import { Category } from '../../categories/entities/category.entity';
import { Wallet } from '../../wallets/entities/wallet.entity';
import { Beneficiary } from '../../beneficiaries/entities/beneficiary.entity';
import { SplitRule } from '../../split-rules/entities/split-rule.entity';
import { LedgerEntry } from './ledger-entry.entity';
import type { LedgerTransactionStatus, LedgerTransactionType } from '../constants/ledger.constants';

@Table({ tableName: 'ledger_transactions' })
export class LedgerTransaction extends Model<LedgerTransaction> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, field: 'user_id' })
  declare userId: string;

  @BelongsTo(() => User)
  declare user?: User;

  @Column({ type: DataType.STRING(40), allowNull: false, unique: true })
  declare reference: string;

  @Column({ type: DataType.STRING(30), allowNull: false })
  declare type: LedgerTransactionType;

  @Column({ type: DataType.STRING(20), allowNull: false })
  declare status: LedgerTransactionStatus;

  @MoneyColumn({ field: 'amount' })
  declare amount: number;

  @MoneyColumn({ field: 'fee', defaultValue: 0 })
  declare fee: number;

  @Column({ type: DataType.STRING(3), allowNull: false, defaultValue: 'NGN' })
  declare currency: string;

  @ForeignKey(() => Category)
  @Column({ type: DataType.UUID, allowNull: true, field: 'category_id' })
  declare categoryId: string | null;

  @BelongsTo(() => Category)
  declare category?: Category | null;

  @ForeignKey(() => Wallet)
  @Column({ type: DataType.UUID, allowNull: true, field: 'wallet_id' })
  declare walletId: string | null;

  @BelongsTo(() => Wallet)
  declare wallet?: Wallet | null;

  @ForeignKey(() => Beneficiary)
  @Column({ type: DataType.UUID, allowNull: true, field: 'beneficiary_id' })
  declare beneficiaryId: string | null;

  @BelongsTo(() => Beneficiary)
  declare beneficiary?: Beneficiary | null;

  @ForeignKey(() => SplitRule)
  @Column({ type: DataType.UUID, allowNull: true, field: 'split_rule_id' })
  declare splitRuleId: string | null;

  @BelongsTo(() => SplitRule)
  declare splitRule?: SplitRule | null;

  @Column({ type: DataType.UUID, allowNull: true, field: 'split_run_id' })
  declare splitRunId: string | null;

  @Column({ type: DataType.STRING(200), allowNull: true, field: 'counterparty_name' })
  declare counterpartyName: string | null;

  @Column({ type: DataType.STRING(200), allowNull: true })
  declare narration: string | null;

  @Column({ type: DataType.STRING(120), allowNull: true, field: 'provider_reference' })
  declare providerReference: string | null;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare metadata: Record<string, unknown> | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'completed_at' })
  declare completedAt: Date | null;

  @HasMany(() => LedgerEntry)
  declare entries?: LedgerEntry[];

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}

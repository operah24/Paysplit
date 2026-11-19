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
} from 'sequelize-typescript';
import { MoneyColumn } from '../../../core/money-column.decorator';
import { LedgerAccount } from './ledger-account.entity';
import { LedgerTransaction } from './ledger-transaction.entity';

@Table({ tableName: 'ledger_entries', updatedAt: false })
export class LedgerEntry extends Model<LedgerEntry> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => LedgerTransaction)
  @Column({ type: DataType.UUID, allowNull: false, field: 'transaction_id' })
  declare transactionId: string;

  @BelongsTo(() => LedgerTransaction)
  declare transaction?: LedgerTransaction;

  @ForeignKey(() => LedgerAccount)
  @Column({ type: DataType.UUID, allowNull: false, field: 'account_id' })
  declare accountId: string;

  @BelongsTo(() => LedgerAccount)
  declare account?: LedgerAccount;

  @MoneyColumn({ field: 'amount' })
  declare amount: number;

  @MoneyColumn({ field: 'balance_after' })
  declare balanceAfter: number;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;
}

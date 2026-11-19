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
import { Wallet } from '../../wallets/entities/wallet.entity';
import type { LedgerAccountType } from '../constants/ledger.constants';

@Table({ tableName: 'ledger_accounts' })
export class LedgerAccount extends Model<LedgerAccount> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: true, field: 'user_id' })
  declare userId: string | null;

  @Column({ type: DataType.STRING(20), allowNull: false })
  declare type: LedgerAccountType;

  @Column({ type: DataType.STRING(40), allowNull: true })
  declare code: string | null;

  @ForeignKey(() => Wallet)
  @Column({ type: DataType.UUID, allowNull: true, unique: true, field: 'wallet_id' })
  declare walletId: string | null;

  @BelongsTo(() => Wallet)
  declare wallet?: Wallet;

  @Column({ type: DataType.STRING(3), allowNull: false, defaultValue: 'NGN' })
  declare currency: string;

  @MoneyColumn({ field: 'balance', defaultValue: 0 })
  declare balance: number;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}

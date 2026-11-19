import { Table, Column, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { BaseEntity } from '../../../core/base.entity';
import { MoneyColumn } from '../../../core/money-column.decorator';
import { User } from '../../users/entities/user.entity';
import { Wallet } from '../../wallets/entities/wallet.entity';
import { Beneficiary } from '../../beneficiaries/entities/beneficiary.entity';

export type SplitRuleStatus = 'active' | 'paused';
export type SplitRuleMethod = 'fixed' | 'percentage';
export type SplitRuleDestinationType = 'wallet' | 'beneficiary';

@Table({ tableName: 'split_rules' })
export class SplitRule extends BaseEntity<SplitRule> {
  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, field: 'user_id' })
  declare userId: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare name: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare priority: number;

  @Column({ type: DataType.STRING(20), allowNull: false, field: 'destination_type' })
  declare destinationType: SplitRuleDestinationType;

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

  @Column({ type: DataType.STRING(20), allowNull: false })
  declare method: SplitRuleMethod;

  @MoneyColumn({ field: 'fixed_amount', allowNull: true })
  declare fixedAmount: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true, field: 'percentage_bps' })
  declare percentageBps: number | null;

  @Column({ type: DataType.STRING(20), allowNull: false, defaultValue: 'active' })
  declare status: SplitRuleStatus;
}

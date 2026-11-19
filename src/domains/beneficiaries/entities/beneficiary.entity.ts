import { Table, Column, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { BaseEntity } from '../../../core/base.entity';
import { User } from '../../users/entities/user.entity';
import { Category } from '../../categories/entities/category.entity';

export type BeneficiaryStatus = 'active' | 'paused';

@Table({ tableName: 'beneficiaries' })
export class Beneficiary extends BaseEntity<Beneficiary> {
  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, field: 'user_id' })
  declare userId: string;

  @Column({ type: DataType.STRING(20), allowNull: false, field: 'bank_code' })
  declare bankCode: string;

  @Column({ type: DataType.STRING(120), allowNull: false, field: 'bank_name' })
  declare bankName: string;

  @Column({ type: DataType.STRING(10), allowNull: false, field: 'account_number' })
  declare accountNumber: string;

  @Column({ type: DataType.STRING(200), allowNull: false, field: 'account_name' })
  declare accountName: string;

  @ForeignKey(() => Category)
  @Column({ type: DataType.UUID, allowNull: false, field: 'category_id' })
  declare categoryId: string;

  @BelongsTo(() => Category)
  declare category?: Category;

  @Column({ type: DataType.STRING(100), allowNull: true })
  declare narration: string | null;

  @Column({ type: DataType.STRING(20), allowNull: false, defaultValue: 'active' })
  declare status: BeneficiaryStatus;
}

export function maskAccountNumber(accountNumber: string): string {
  return `*****${accountNumber.slice(-4)}`;
}

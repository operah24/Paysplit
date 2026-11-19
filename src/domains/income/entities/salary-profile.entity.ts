import { Table, Column, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { BaseEntity } from '../../../core/base.entity';
import { MoneyColumn } from '../../../core/money-column.decorator';
import { User } from '../../users/entities/user.entity';

@Table({ tableName: 'salary_profiles' })
export class SalaryProfile extends BaseEntity<SalaryProfile> {
  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, unique: true, field: 'user_id' })
  declare userId: string;

  @BelongsTo(() => User)
  declare user?: User;

  @Column({ type: DataType.STRING(120), allowNull: false, field: 'employer_name' })
  declare employerName: string;

  @MoneyColumn({ field: 'monthly_amount' })
  declare monthlyAmount: number;

  @Column({ type: DataType.STRING(3), allowNull: false, defaultValue: 'NGN' })
  declare currency: string;

  @Column({ type: DataType.SMALLINT, allowNull: false, field: 'payday_day' })
  declare paydayDay: number;
}

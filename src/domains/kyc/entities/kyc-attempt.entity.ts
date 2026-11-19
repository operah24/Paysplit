import { Table, Column, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { BaseEntity } from '../../../core/base.entity';
import { User } from '../../users/entities/user.entity';
import type { KycAttemptOutcome, KycStep } from '../constants/kyc.constants';

export interface KycCheckRecord {
  check: string;
  httpStatus?: number;
  passed?: boolean;
  score?: number;
}

@Table({ tableName: 'kyc_attempts' })
export class KycAttempt extends BaseEntity<KycAttempt> {
  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, field: 'user_id' })
  declare userId: string;

  @BelongsTo(() => User)
  declare user?: User;

  @Column({ type: DataType.STRING, allowNull: false })
  declare step: KycStep;

  @Column({ type: DataType.STRING, allowNull: true })
  declare method: string | null;

  @Column({ type: DataType.STRING, allowNull: false })
  declare outcome: KycAttemptOutcome;

  @Column({ type: DataType.STRING, allowNull: true })
  declare reason: string | null;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: [] })
  declare checks: KycCheckRecord[];
}

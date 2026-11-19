import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { CreationAttributes, Op } from 'sequelize';
import { KycAttempt, KycCheckRecord } from '../entities/kyc-attempt.entity';
import type { KycAttemptOutcome, KycStep } from '../constants/kyc.constants';

@Injectable()
export class KycAttemptRepository {
  constructor(
    @InjectModel(KycAttempt)
    private readonly model: typeof KycAttempt,
  ) {}

  async record(data: {
    userId: string;
    step: KycStep;
    method: string | null;
    outcome: KycAttemptOutcome;
    reason: string | null;
    checks: KycCheckRecord[];
  }): Promise<void> {
    await this.model.create(data as CreationAttributes<KycAttempt>);
  }

  async findCounted(userId: string, step: KycStep, since: Date): Promise<KycAttempt[]> {
    return this.model.findAll({
      where: {
        userId,
        step,
        outcome: { [Op.ne]: 'provider_error' },
        createdAt: { [Op.gte]: since },
      },
      order: [['createdAt', 'ASC']],
    });
  }
}

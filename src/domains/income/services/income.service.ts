import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { CreationAttributes } from 'sequelize';
import { SalaryProfile } from '../entities/salary-profile.entity';
import { UpsertIncomeDto } from '../dtos/upsert-income.dto';
import { nextPayday, ordinal } from '../../../shared/utils/payday.util';
import { DEFAULT_CURRENCY } from '../../ledger/constants/ledger.constants';

export interface IncomeView {
  employerName: string;

  monthlyAmount: number;
  currency: string;
  paydayDay: number;

  paydayLabel: string;

  nextPayday: string;
  updatedAt: Date;
}

@Injectable()
export class IncomeService {
  constructor(@InjectModel(SalaryProfile) private readonly profiles: typeof SalaryProfile) {}

  findByUserId(userId: string): Promise<SalaryProfile | null> {
    return this.profiles.findOne({ where: { userId } });
  }

  async get(userId: string): Promise<IncomeView | null> {
    const profile = await this.findByUserId(userId);
    return profile ? IncomeService.toView(profile) : null;
  }

  async upsert(userId: string, dto: UpsertIncomeDto): Promise<IncomeView> {
    const values = {
      employerName: dto.employerName,
      monthlyAmount: dto.monthlyAmount,
      paydayDay: dto.paydayDay,
    };
    const existing = await this.findByUserId(userId);
    const profile = existing
      ? await existing.update(values)
      : await this.profiles.create({
          userId,
          currency: DEFAULT_CURRENCY,
          ...values,
        } as CreationAttributes<SalaryProfile>);
    return IncomeService.toView(profile);
  }

  static toView(profile: SalaryProfile, now: Date = new Date()): IncomeView {
    return {
      employerName: profile.employerName,
      monthlyAmount: profile.monthlyAmount,
      currency: profile.currency,
      paydayDay: profile.paydayDay,
      paydayLabel: ordinal(profile.paydayDay),
      nextPayday: nextPayday(profile.paydayDay, now),
      updatedAt: profile.updatedAt,
    };
  }
}

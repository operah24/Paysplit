import { HttpException } from '@nestjs/common';
import { SplitRulesService, SPLIT_RULE_ERROR_CODES } from './split-rules.service';
import { SplitRule } from '../entities/split-rule.entity';
import { Wallet } from '../../wallets/entities/wallet.entity';
import { Beneficiary } from '../../beneficiaries/entities/beneficiary.entity';
import { IncomeService } from '../../income/services/income.service';
import { SetupEventsService } from '../../income/services/setup-events.service';
import { TransactionQueryService } from '../../ledger/services/transaction-query.service';
import { User } from '../../users/entities/user.entity';

const errorOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    const response = (error as HttpException).getResponse() as Record<string, unknown>;
    return { status: (error as HttpException).getStatus(), ...response };
  }
  throw new Error('expected rejection');
};

type RuleRow = Partial<SplitRule> & { id: string };

describe('SplitRulesService', () => {
  let existing: RuleRow[];
  let baseline: number | null;
  let rulesModel: { findAll: jest.Mock; findOne: jest.Mock; create: jest.Mock };
  let service: SplitRulesService;
  const user = { id: 'u1' } as User;

  beforeEach(() => {
    existing = [];
    baseline = 85_000_000;
    rulesModel = {
      findAll: jest.fn(() => Promise.resolve(existing)),
      findOne: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve({
          id: where.id,
          name: 'Rule',
          priority: 10,
          status: 'active',
          destinationType: 'wallet',
          method: 'fixed',
          fixedAmount: 3_000_000,
          percentageBps: null,
          wallet: { id: 'w1', name: 'Rent', accentColor: 'green' },
        }),
      ),
      create: jest.fn((data: Record<string, unknown>) => Promise.resolve({ id: 'new', ...data })),
    };
    service = new SplitRulesService(
      rulesModel as unknown as typeof SplitRule,
      {
        findOne: jest.fn().mockResolvedValue({ id: 'w1', name: 'Rent' }),
      } as unknown as typeof Wallet,
      { findOne: jest.fn().mockResolvedValue(null) } as unknown as typeof Beneficiary,
      {
        findByUserId: jest.fn(() =>
          Promise.resolve(baseline === null ? null : { monthlyAmount: baseline }),
        ),
      } as unknown as IncomeService,
      {
        afterSetupChange: jest.fn().mockResolvedValue({ nextStep: 'dashboard' }),
      } as unknown as SetupEventsService,
      {
        allocatedByRule: jest.fn().mockResolvedValue(new Map()),
      } as unknown as TransactionQueryService,
    );
  });

  const dto = (overrides: Record<string, unknown> = {}) => ({
    name: 'Rent',
    priority: 10,
    destinationType: 'wallet' as const,
    walletId: 'w1',
    method: 'fixed' as const,
    value: 3_000_000,
    ...overrides,
  });

  it('stores fixed amounts in kobo and percentages in basis points', () => {
    expect(SplitRulesService.valueFields('fixed', 3_000_000)).toEqual({
      method: 'fixed',
      fixedAmount: 3_000_000,
      percentageBps: null,
    });
    expect(SplitRulesService.valueFields('percentage', 12.5)).toEqual({
      method: 'percentage',
      fixedAmount: null,
      percentageBps: 1250,
    });
  });

  it('rejects fractional kobo and out-of-range percentages', () => {
    expect(() => SplitRulesService.valueFields('fixed', 10.5)).toThrow(HttpException);
    expect(() => SplitRulesService.valueFields('percentage', 100.01)).toThrow(HttpException);
  });

  it('creates a rule and reports the refreshed onboarding status', async () => {
    const result = await service.create(user, dto());
    expect(rulesModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        destinationType: 'wallet',
        walletId: 'w1',
        beneficiaryId: null,
        fixedAmount: 3_000_000,
        status: 'active',
      }),
    );
    expect(result.onboarding).toEqual({ nextStep: 'dashboard' });
  });

  it('blocks rules that would exceed the monthly salary', async () => {
    existing = [
      { id: 'r1', method: 'percentage', percentageBps: 7000, fixedAmount: null },
      { id: 'r2', method: 'fixed', fixedAmount: 20_000_000, percentageBps: null },
    ];

    const error = await errorOf(service.create(user, dto({ value: 6_000_000 })));
    expect(error).toMatchObject({
      status: 422,
      code: SPLIT_RULE_ERROR_CODES.ALLOCATION_EXCEEDS_SALARY,
      unallocatedAmount: 5_500_000,
    });
    expect(rulesModel.create).not.toHaveBeenCalled();
  });

  it('caps percentages at 100% even without a salary set', async () => {
    baseline = null;
    existing = [{ id: 'r1', method: 'percentage', percentageBps: 9000, fixedAmount: null }];
    const error = await errorOf(service.create(user, dto({ method: 'percentage', value: 15 })));
    expect(error).toMatchObject({
      code: SPLIT_RULE_ERROR_CODES.ALLOCATION_EXCEEDS_SALARY,
      unallocatedPercent: 10,
    });
  });

  it('allows paused rules regardless of allocation', async () => {
    existing = [{ id: 'r1', method: 'percentage', percentageBps: 10000, fixedAmount: null }];
    await service.create(user, dto({ status: 'paused' }));
    expect(rulesModel.create).toHaveBeenCalled();
  });

  it('rejects a destination the user does not own', async () => {
    const error = await errorOf(
      service.create(user, dto({ destinationType: 'beneficiary', beneficiaryId: 'b-other' })),
    );
    expect(error).toMatchObject({ code: SPLIT_RULE_ERROR_CODES.DESTINATION_NOT_FOUND });
  });
});

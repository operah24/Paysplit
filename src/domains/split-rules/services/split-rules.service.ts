import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { CreationAttributes, Op, UniqueConstraintError, WhereOptions } from 'sequelize';
import {
  SplitRule,
  SplitRuleDestinationType,
  SplitRuleMethod,
  SplitRuleStatus,
} from '../entities/split-rule.entity';
import { Wallet } from '../../wallets/entities/wallet.entity';
import { Beneficiary } from '../../beneficiaries/entities/beneficiary.entity';
import { User } from '../../users/entities/user.entity';
import { IncomeService } from '../../income/services/income.service';
import { SetupEventsService } from '../../income/services/setup-events.service';
import { TransactionQueryService } from '../../ledger/services/transaction-query.service';
import { OnboardingStatus } from '../../users/utils/onboarding-status';
import { WALLET_ACCENT_COLORS } from '../../wallets/constants/wallet.constants';
import {
  CreateSplitRuleDto,
  ListSplitRulesQuery,
  UpdateSplitRuleDto,
} from '../dtos/split-rule.dtos';
import { plannedAmount, ruleDisplayValue, ruleValue } from '../utils/rule-view.util';
import { AppError } from '../../../shared/utils/app-error.util';
import { PaginatedResult } from '../../../shared/utils/pagination.utils';
import {
  FULL_BPS,
  MAX_AMOUNT_MINOR,
  MIN_AMOUNT_MINOR,
  bpsToPercent,
  percentOf,
  percentToBps,
} from '../../../shared/utils/money.util';
import { startOfLagosMonth } from '../../../shared/utils/payday.util';

export const SPLIT_RULE_ERROR_CODES = {
  SPLIT_RULE_NOT_FOUND: 'SPLIT_RULE_NOT_FOUND',
  DESTINATION_NOT_FOUND: 'DESTINATION_NOT_FOUND',
  DESTINATION_HAS_RULE: 'DESTINATION_HAS_RULE',
  INVALID_RULE_VALUE: 'INVALID_RULE_VALUE',
  ALLOCATION_EXCEEDS_SALARY: 'ALLOCATION_EXCEEDS_SALARY',
} as const;

export interface RuleDestinationView {
  type: SplitRuleDestinationType;
  id: string;
  name: string;

  label: string;

  color: string | null;

  paused: boolean;
}

export interface SplitRuleView {
  id: string;
  name: string;
  priority: number;
  status: SplitRuleStatus;
  destinationType: SplitRuleDestinationType;
  destination: RuleDestinationView | null;
  method: SplitRuleMethod;

  value: number;
  displayValue: string;

  plannedAmount: number | null;

  allocatedThisMonth: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SplitRulesSummary {
  baselineSalary: number | null;

  totalAllocated: number;

  allocatedPercent: number;

  remainder: number;
  remainderPercent: number;
  overAllocated: boolean;
  activeRules: number;
  toWallets: number;
  toBeneficiaries: number;

  segments: {
    ruleId: string;
    name: string;
    destinationName: string;
    destinationType: SplitRuleDestinationType;
    color: string | null;
    amount: number;
    percent: number;
  }[];
}

type RuleValueFields = Pick<SplitRule, 'method' | 'fixedAmount' | 'percentageBps'>;

@Injectable()
export class SplitRulesService {
  private readonly logger = new Logger(SplitRulesService.name);

  constructor(
    @InjectModel(SplitRule) private readonly rules: typeof SplitRule,
    @InjectModel(Wallet) private readonly wallets: typeof Wallet,
    @InjectModel(Beneficiary) private readonly beneficiaries: typeof Beneficiary,
    private readonly income: IncomeService,
    private readonly setupEvents: SetupEventsService,
    private readonly transactions: TransactionQueryService,
  ) {}

  async list(userId: string, query: ListSplitRulesQuery): Promise<PaginatedResult<SplitRuleView>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, query.limit ?? 10);
    const where: WhereOptions[] = [{ userId }];
    if (query.status && query.status !== 'all') where.push({ status: query.status });
    const search = query.search?.trim();
    if (search) {
      const like = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      where.push({
        [Op.or]: [
          { name: { [Op.iLike]: like } },
          { '$wallet.name$': { [Op.iLike]: like } },
          { '$beneficiary.account_name$': { [Op.iLike]: like } },
        ],
      });
    }

    const [{ count, rows }, baseline, allocated] = await Promise.all([
      this.rules.findAndCountAll({
        where: { [Op.and]: where },
        include: SplitRulesService.destinationIncludes(),
        order: [
          ['priority', 'ASC'],
          ['createdAt', 'ASC'],
        ],
        limit,
        offset: (page - 1) * limit,
        subQuery: false,
        distinct: true,
      }),
      this.baseline(userId),
      this.transactions.allocatedByRule(userId, startOfLagosMonth()),
    ]);

    return {
      data: rows.map((rule) =>
        SplitRulesService.toView(rule, baseline, allocated.get(rule.id) ?? 0),
      ),
      pagination: { total: count, page, limit, pages: Math.ceil(count / limit) },
    };
  }

  async get(userId: string, id: string): Promise<SplitRuleView> {
    const rule = await this.findOwnedOrThrow(userId, id);
    const [baseline, allocated] = await Promise.all([
      this.baseline(userId),
      this.transactions.allocatedByRule(userId, startOfLagosMonth()),
    ]);
    return SplitRulesService.toView(rule, baseline, allocated.get(id) ?? 0);
  }

  async summary(userId: string): Promise<SplitRulesSummary> {
    const [rules, baseline] = await Promise.all([
      this.rules.findAll({
        where: { userId, status: 'active' },
        include: SplitRulesService.destinationIncludes(),
        order: [
          ['priority', 'ASC'],
          ['createdAt', 'ASC'],
        ],
      }),
      this.baseline(userId),
    ]);

    let toWallets = 0;
    let toBeneficiaries = 0;
    const segments: SplitRulesSummary['segments'] = [];
    for (const rule of rules) {
      const amount = plannedAmount(rule, baseline) ?? 0;
      if (rule.destinationType === 'wallet') toWallets += amount;
      else toBeneficiaries += amount;
      const destination = SplitRulesService.destinationView(rule);
      segments.push({
        ruleId: rule.id,
        name: rule.name,
        destinationName: destination?.name ?? 'Deleted destination',
        destinationType: rule.destinationType,
        color: destination?.color ?? null,
        amount,
        percent: baseline ? percentOf(amount, baseline) : bpsToPercent(rule.percentageBps ?? 0),
      });
    }

    const totalAllocated = toWallets + toBeneficiaries;
    const remainder = baseline === null ? 0 : Math.max(0, baseline - totalAllocated);
    return {
      baselineSalary: baseline,
      totalAllocated,
      allocatedPercent: baseline ? percentOf(totalAllocated, baseline) : 0,
      remainder,
      remainderPercent: baseline ? percentOf(remainder, baseline) : 0,
      overAllocated: baseline !== null && totalAllocated > baseline,
      activeRules: rules.length,
      toWallets,
      toBeneficiaries,
      segments,
    };
  }

  async create(
    user: User,
    dto: CreateSplitRuleDto,
  ): Promise<{ rule: SplitRuleView; onboarding: OnboardingStatus }> {
    const destination = await this.resolveDestination(
      user.id,
      dto.destinationType,
      dto.walletId,
      dto.beneficiaryId,
    );
    const valueFields = SplitRulesService.valueFields(dto.method, dto.value);
    const status = dto.status ?? 'active';
    if (status === 'active') await this.assertWithinSalary(user.id, valueFields);

    let created: SplitRule;
    try {
      created = await this.rules.create({
        userId: user.id,
        name: dto.name,
        priority: dto.priority,
        status,
        ...destination,
        ...valueFields,
      } as CreationAttributes<SplitRule>);
    } catch (error) {
      throw SplitRulesService.mapUniqueDestination(error);
    }

    const onboarding = await this.setupEvents.afterSetupChange(user);
    return { rule: await this.get(user.id, created.id), onboarding };
  }

  async update(userId: string, id: string, dto: UpdateSplitRuleDto): Promise<SplitRuleView> {
    const rule = await this.findOwnedOrThrow(userId, id);
    const changes: Partial<SplitRule> = {};

    if (dto.name !== undefined) changes.name = dto.name;
    if (dto.priority !== undefined) changes.priority = dto.priority;
    if (dto.status !== undefined) changes.status = dto.status;

    if (dto.destinationType || dto.walletId || dto.beneficiaryId) {
      const type = dto.destinationType ?? rule.destinationType;
      Object.assign(
        changes,
        await this.resolveDestination(userId, type, dto.walletId, dto.beneficiaryId),
      );
    }

    if (dto.method !== undefined || dto.value !== undefined) {
      const method = dto.method ?? rule.method;
      if (dto.value === undefined) {
        throw AppError.unprocessable(
          SPLIT_RULE_ERROR_CODES.INVALID_RULE_VALUE,
          'Send `value` together with `method`.',
        );
      }
      Object.assign(changes, SplitRulesService.valueFields(method, dto.value));
    }

    const nextStatus = changes.status ?? rule.status;
    if (nextStatus === 'active') {
      await this.assertWithinSalary(
        userId,
        {
          method: changes.method ?? rule.method,
          fixedAmount: changes.method ? (changes.fixedAmount ?? null) : rule.fixedAmount,
          percentageBps: changes.method ? (changes.percentageBps ?? null) : rule.percentageBps,
        },
        id,
      );
    }

    try {
      await rule.update(changes);
    } catch (error) {
      throw SplitRulesService.mapUniqueDestination(error);
    }
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<{ message: string }> {
    const rule = await this.findOwnedOrThrow(userId, id);
    await rule.destroy();
    this.logger.log(`Split rule ${id} deleted by ${userId}`);
    return { message: 'Split rule deleted' };
  }

  async findOwnedOrThrow(userId: string, id: string): Promise<SplitRule> {
    const rule = await this.rules.findOne({
      where: { id, userId },
      include: SplitRulesService.destinationIncludes(),
    });
    if (!rule) {
      throw AppError.notFound(SPLIT_RULE_ERROR_CODES.SPLIT_RULE_NOT_FOUND, 'Split rule not found.');
    }
    return rule;
  }

  private async baseline(userId: string): Promise<number | null> {
    return (await this.income.findByUserId(userId))?.monthlyAmount ?? null;
  }

  private async resolveDestination(
    userId: string,
    type: SplitRuleDestinationType,
    walletId?: string,
    beneficiaryId?: string,
  ): Promise<Pick<SplitRule, 'destinationType' | 'walletId' | 'beneficiaryId'>> {
    if (type === 'wallet') {
      const wallet = walletId && (await this.wallets.findOne({ where: { id: walletId, userId } }));
      if (!wallet) throw SplitRulesService.destinationNotFound('wallet');
      return { destinationType: 'wallet', walletId: wallet.id, beneficiaryId: null };
    }
    const beneficiary =
      beneficiaryId && (await this.beneficiaries.findOne({ where: { id: beneficiaryId, userId } }));
    if (!beneficiary) throw SplitRulesService.destinationNotFound('beneficiary');
    return { destinationType: 'beneficiary', walletId: null, beneficiaryId: beneficiary.id };
  }

  private async assertWithinSalary(
    userId: string,
    candidate: RuleValueFields,
    excludeId?: string,
  ): Promise<void> {
    const where: WhereOptions<SplitRule> = { userId, status: 'active' };
    if (excludeId) Object.assign(where, { id: { [Op.ne]: excludeId } });
    const [others, baseline] = await Promise.all([
      this.rules.findAll({ where }),
      this.baseline(userId),
    ]);

    const othersBps = others.reduce((sum, r) => sum + (r.percentageBps ?? 0), 0);
    const othersPlanned =
      baseline === null ? 0 : others.reduce((sum, r) => sum + (plannedAmount(r, baseline) ?? 0), 0);
    const candidatePlanned = plannedAmount(candidate, baseline);

    const overPercent = othersBps + (candidate.percentageBps ?? 0) > FULL_BPS;
    const overSalary = baseline !== null && othersPlanned + (candidatePlanned ?? 0) > baseline;

    if (overPercent || overSalary) {
      const unallocatedAmount = baseline === null ? null : Math.max(0, baseline - othersPlanned);
      throw AppError.unprocessable(
        SPLIT_RULE_ERROR_CODES.ALLOCATION_EXCEEDS_SALARY,
        'Your split rules would add up to more than 100% of your salary.',
        {
          unallocatedAmount,
          unallocatedPercent:
            baseline === null
              ? bpsToPercent(Math.max(0, FULL_BPS - othersBps))
              : percentOf(unallocatedAmount ?? 0, baseline),
        },
      );
    }
  }

  static valueFields(method: SplitRuleMethod, value: number): RuleValueFields {
    if (method === 'fixed') {
      if (!Number.isInteger(value) || value < MIN_AMOUNT_MINOR || value > MAX_AMOUNT_MINOR) {
        throw AppError.unprocessable(
          SPLIT_RULE_ERROR_CODES.INVALID_RULE_VALUE,
          'A fixed amount must be a whole number of kobo of at least ₦1.00.',
        );
      }
      return { method, fixedAmount: value, percentageBps: null };
    }
    const bps = percentToBps(value);
    if (bps < 1 || bps > FULL_BPS) {
      throw AppError.unprocessable(
        SPLIT_RULE_ERROR_CODES.INVALID_RULE_VALUE,
        'A percentage must be between 0.01 and 100.',
      );
    }
    return { method, fixedAmount: null, percentageBps: bps };
  }

  private static destinationIncludes() {
    return [
      { model: Wallet, attributes: ['id', 'name', 'accentColor'], required: false },
      {
        model: Beneficiary,
        attributes: ['id', 'accountName', 'bankName', 'status'],
        required: false,
      },
    ];
  }

  static destinationView(rule: SplitRule): RuleDestinationView | null {
    if (rule.destinationType === 'wallet') {
      if (!rule.wallet) return null;
      return {
        type: 'wallet',
        id: rule.wallet.id,
        name: rule.wallet.name,
        label: `${rule.wallet.name} (wallet)`,
        color: WALLET_ACCENT_COLORS[rule.wallet.accentColor] ?? null,
        paused: false,
      };
    }
    if (!rule.beneficiary) return null;
    return {
      type: 'beneficiary',
      id: rule.beneficiary.id,
      name: rule.beneficiary.accountName,
      label: `${rule.beneficiary.accountName} (${rule.beneficiary.bankName})`,
      color: null,
      paused: rule.beneficiary.status === 'paused',
    };
  }

  static toView(
    rule: SplitRule,
    baseline: number | null,
    allocatedThisMonth: number,
  ): SplitRuleView {
    return {
      id: rule.id,
      name: rule.name,
      priority: rule.priority,
      status: rule.status,
      destinationType: rule.destinationType,
      destination: SplitRulesService.destinationView(rule),
      method: rule.method,
      value: ruleValue(rule),
      displayValue: ruleDisplayValue(rule),
      plannedAmount: plannedAmount(rule, baseline),
      allocatedThisMonth,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }

  private static destinationNotFound(type: SplitRuleDestinationType) {
    return AppError.unprocessable(
      SPLIT_RULE_ERROR_CODES.DESTINATION_NOT_FOUND,
      type === 'wallet' ? 'Choose one of your wallets.' : 'Choose one of your beneficiaries.',
    );
  }

  private static mapUniqueDestination(error: unknown): unknown {
    if (error instanceof UniqueConstraintError) {
      return AppError.conflict(
        SPLIT_RULE_ERROR_CODES.DESTINATION_HAS_RULE,
        'This destination already has a split rule. Edit that rule instead.',
      );
    }
    return error;
  }
}

import { Injectable } from '@nestjs/common';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/services/users.service';
import { OnboardingStatus } from '../../users/utils/onboarding-status';
import { IncomeService, IncomeView } from '../../income/services/income.service';
import { SplitRulesService } from '../../split-rules/services/split-rules.service';
import { WalletsService } from '../../wallets/services/wallets.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
import {
  CashFlowBucket,
  TransactionQueryService,
} from '../../ledger/services/transaction-query.service';
import {
  SalaryAccountService,
  SalaryAccountView,
  userTier,
} from '../../salary-account/services/salary-account.service';
import { percentOf } from '../../../shared/utils/money.util';
import { lagosDayEnd, lagosDayStart, lagosToday } from '../../../shared/utils/payday.util';
import { AppError } from '../../../shared/utils/app-error.util';

export interface DashboardSummary {
  firstName: string;
  tier: 1 | 2;
  salaryAccount: SalaryAccountView;
  income: IncomeView | null;

  splitAllocation: {
    amount: number;
    activeRules: number;

    percentOfSalary: number;
  };

  wallets: { total: number; activeCount: number; withTargetCount: number };

  nextSplitRun: {
    date: string | null;

    fundStatus: 'available' | 'unavailable';
  };

  partition: {
    baselineSalary: number | null;
    toWallets: number;
    toBeneficiaries: number;

    remaining: number;
    remainingPercent: number;
  };
  unreadNotifications: number;
  onboarding: OnboardingStatus;
}

export interface CashFlowResponse {
  from: string;
  to: string;
  granularity: 'day' | 'month';
  buckets: CashFlowBucket[];
  totals: { inflow: number; toWallets: number; toBeneficiaries: number; movedBack: number };

  monthOverMonth: { current: number; previous: number; changePercent: number | null };
}

const MAX_RANGE_DAYS = 366;
const DAILY_UP_TO_DAYS = 62;
const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');

@Injectable()
export class DashboardService {
  constructor(
    private readonly usersService: UsersService,
    private readonly income: IncomeService,
    private readonly splitRules: SplitRulesService,
    private readonly wallets: WalletsService,
    private readonly notifications: NotificationsService,
    private readonly transactions: TransactionQueryService,
    private readonly salaryAccount: SalaryAccountService,
  ) {}

  async summary(user: User): Promise<DashboardSummary> {
    const [salaryAccount, income, rules, wallets, unreadNotifications, onboarding] =
      await Promise.all([
        this.salaryAccount.getView(user),
        this.income.get(user.id),
        this.splitRules.summary(user.id),
        this.wallets.list(user.id),
        this.notifications.unreadCount(user.id),
        this.usersService.getOnboardingStatus(user),
      ]);

    const fundsCover = rules.totalAllocated > 0 && salaryAccount.balance >= rules.totalAllocated;
    return {
      firstName: user.firstName,
      tier: userTier(user),
      salaryAccount,
      income,
      splitAllocation: {
        amount: rules.totalAllocated,
        activeRules: rules.activeRules,
        percentOfSalary: rules.allocatedPercent,
      },
      wallets: {
        total: wallets.reduce((sum, w) => sum + w.balance, 0),
        activeCount: wallets.length,
        withTargetCount: wallets.filter((w) => w.targetAmount !== null).length,
      },
      nextSplitRun: {
        date: income?.nextPayday ?? null,
        fundStatus: fundsCover ? 'available' : 'unavailable',
      },
      partition: {
        baselineSalary: rules.baselineSalary,
        toWallets: rules.toWallets,
        toBeneficiaries: rules.toBeneficiaries,
        remaining: rules.remainder,
        remainingPercent: rules.remainderPercent,
      },
      unreadNotifications,
      onboarding,
    };
  }

  async cashFlow(userId: string, fromDate?: string, toDate?: string): Promise<CashFlowResponse> {
    const today = lagosToday();
    const todayStr = `${today.year}-${pad(today.monthIndex + 1)}-${pad(today.day)}`;
    const to = toDate ?? todayStr;
    const from =
      fromDate ??
      (() => {
        const d = new Date(Date.UTC(today.year, today.monthIndex - 8, 1));
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
      })();

    const start = lagosDayStart(from);
    const end = lagosDayEnd(to);
    const days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
    if (days <= 0)
      throw AppError.badRequest('INVALID_DATE_RANGE', '`from` must be on or before `to`.');
    if (days > MAX_RANGE_DAYS) {
      throw AppError.badRequest('INVALID_DATE_RANGE', 'Choose a range of at most one year.');
    }
    const granularity = days <= DAILY_UP_TO_DAYS ? 'day' : 'month';

    const lastMonthStart = new Date(Date.UTC(today.year, today.monthIndex - 1, 1) - 60 * 60 * 1000);
    const [buckets, months] = await Promise.all([
      this.transactions.cashFlow(userId, start, end, granularity),
      this.transactions.cashFlow(userId, lastMonthStart, new Date(), 'month'),
    ]);

    const totals = buckets.reduce(
      (acc, b) => ({
        inflow: acc.inflow + b.inflow,
        toWallets: acc.toWallets + b.toWallets,
        toBeneficiaries: acc.toBeneficiaries + b.toBeneficiaries,
        movedBack: acc.movedBack + b.movedBack,
      }),
      { inflow: 0, toWallets: 0, toBeneficiaries: 0, movedBack: 0 },
    );

    const currentKey = `${today.year}-${pad(today.monthIndex + 1)}`;
    const current = months.find((m) => m.period === currentKey)?.inflow ?? 0;
    const previous = months.find((m) => m.period !== currentKey)?.inflow ?? 0;

    return {
      from,
      to,
      granularity,
      buckets,
      totals,
      monthOverMonth: {
        current,
        previous,
        changePercent: previous ? percentOf(current - previous, previous) : null,
      },
    };
  }
}

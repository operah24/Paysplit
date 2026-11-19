import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { CreationAttributes, UniqueConstraintError } from 'sequelize';
import { User } from '../../users/entities/user.entity';
import { LedgerService } from '../../ledger/services/ledger.service';
import { LedgerTransaction } from '../../ledger/entities/ledger-transaction.entity';
import {
  LEDGER_TRANSACTION_TYPES as T,
  SYSTEM_ACCOUNTS,
} from '../../ledger/constants/ledger.constants';
import {
  TransactionQueryService,
  TransactionView,
} from '../../ledger/services/transaction-query.service';
import { SplitRule } from '../../split-rules/entities/split-rule.entity';
import { Wallet } from '../../wallets/entities/wallet.entity';
import { Beneficiary } from '../../beneficiaries/entities/beneficiary.entity';
import { SalaryAccountService } from '../../salary-account/services/salary-account.service';
import { AppError } from '../../../shared/utils/app-error.util';
import { PaginatedResult } from '../../../shared/utils/pagination.utils';
import { SkippedRule, SplitRun } from '../entities/split-run.entity';
import {
  SPLIT_ENGINE_ERROR_CODES as E,
  SplitRunStatus,
  SplitRunTrigger,
} from '../constants/split-engine.constants';
import { PlannableRule, planSplit } from '../utils/split-planner';
import { PayoutService } from './payout.service';

export interface SplitRunView {
  id: string;
  trigger: SplitRunTrigger;
  status: SplitRunStatus;

  baseAmount: number;

  availableAmount: number;
  toWallets: number;
  toBeneficiaries: number;
  fees: number;
  skipped: SkippedRule[];

  creditTransactionId: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface SplitRunDetail extends SplitRunView {
  transactions: TransactionView[];
}

type EngineRule = SplitRule & PlannableRule;

@Injectable()
export class SplitEngineService {
  private readonly logger = new Logger(SplitEngineService.name);
  private readonly simulation: boolean;
  private readonly feeReserve: number;

  constructor(
    configService: ConfigService,
    private readonly ledger: LedgerService,
    private readonly transactionsQuery: TransactionQueryService,
    private readonly salaryAccounts: SalaryAccountService,
    private readonly payouts: PayoutService,
    @InjectModel(SplitRule) private readonly rules: typeof SplitRule,
    @InjectModel(SplitRun) private readonly runs: typeof SplitRun,
  ) {
    this.simulation = configService.get<boolean>('payments.simulation', false);
    this.feeReserve = configService.get<number>('payments.transferFeeReserve', 5000);
  }

  async runNow(user: User): Promise<SplitRunDetail> {
    const activeRules = await this.rules.count({ where: { userId: user.id, status: 'active' } });
    if (activeRules === 0) {
      throw AppError.unprocessable(E.NO_ACTIVE_RULES, 'Add or resume a split rule first.');
    }
    if (!this.simulation) {
      const account = await this.salaryAccounts.findByUserId(user.id);
      if (account?.status !== 'active') {
        throw AppError.conflict(
          E.SALARY_ACCOUNT_NOT_ACTIVE,
          account?.status === 'not_eligible'
            ? 'A salary account needs a verified BVN or NIN.'
            : 'Your salary account is not ready yet. Try again shortly.',
          { salaryAccountStatus: account?.status ?? 'not_issued' },
        );
      }
    }
    const balance = (await this.ledger.findSalaryAccount(user.id))?.balance ?? 0;
    if (balance <= 0) {
      throw AppError.unprocessable(E.NOTHING_TO_SPLIT, 'Your salary account is empty.');
    }

    const run = await this.execute(user.id, 'manual', null);
    return this.get(user.id, run.id);
  }

  async runForCredit(userId: string, credit: LedgerTransaction): Promise<SplitRun | null> {
    if (!this.simulation && !(await this.salaryAccounts.findActive(userId))) return null;
    try {
      return await this.execute(userId, 'auto', credit);
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        return this.runs.findOne({ where: { creditTransactionId: credit.id } });
      }
      throw error;
    }
  }

  async list(
    userId: string,
    pagination: { page?: number; limit?: number },
  ): Promise<PaginatedResult<SplitRunView>> {
    const page = Math.max(1, pagination.page ?? 1);
    const limit = Math.max(1, pagination.limit ?? 10);
    const { count, rows } = await this.runs.findAndCountAll({
      where: { userId },
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit,
      offset: (page - 1) * limit,
    });
    return {
      data: rows.map((run) => SplitEngineService.toView(run)),
      pagination: { total: count, page, limit, pages: Math.ceil(count / limit) },
    };
  }

  async get(userId: string, id: string): Promise<SplitRunDetail> {
    const run = await this.runs.findOne({ where: { id, userId } });
    if (!run) throw AppError.notFound(E.SPLIT_RUN_NOT_FOUND, 'Split run not found.');
    const transactions = await this.transactionsQuery.list(
      userId,
      { splitRunId: run.id },
      { page: 1, limit: 100 },
    );
    return { ...SplitEngineService.toView(run), transactions: transactions.data };
  }

  static toView(run: SplitRun): SplitRunView {
    return {
      id: run.id,
      trigger: run.trigger,
      status: run.status,
      baseAmount: run.baseAmount,
      availableAmount: run.availableAmount,
      toWallets: run.toWallets,
      toBeneficiaries: run.toBeneficiaries,
      fees: run.fees,
      skipped: run.skipped ?? [],
      creditTransactionId: run.creditTransactionId,
      createdAt: run.createdAt,
      completedAt: run.completedAt,
    };
  }

  private async execute(
    userId: string,
    trigger: SplitRunTrigger,
    credit: LedgerTransaction | null,
  ): Promise<SplitRun> {
    const { run, payoutIds } = await this.ledger.inTransaction(async (t) => {
      const salary = await this.ledger.getOrCreateSalaryAccount(userId, t);
      const locked = await this.ledger.lockAccount(salary.id, t);
      const available = locked!.balance;
      const baseAmount = credit ? credit.amount : available;

      const rules = (await this.rules.findAll({
        where: { userId, status: 'active' },
        include: [
          { model: Wallet, required: false },
          { model: Beneficiary, required: false },
        ],
        order: [
          ['priority', 'ASC'],
          ['createdAt', 'ASC'],
        ],
        transaction: t,
      })) as EngineRule[];

      const walletAccounts = new Map<string, string>();
      for (const rule of rules) {
        if (rule.walletId && rule.wallet) {
          const account = await this.ledger.findWalletAccount(rule.walletId, t);
          if (account) walletAccounts.set(rule.walletId, account.id);
        }
        const exists =
          rule.destinationType === 'wallet'
            ? Boolean(rule.walletId && walletAccounts.has(rule.walletId))
            : Boolean(rule.beneficiary);
        rule.destinationExists = exists;
        rule.destinationActive =
          rule.destinationType === 'wallet' || rule.beneficiary?.status === 'active';
      }

      const plan = planSplit({
        rules,
        baseAmount,
        available,
        payoutFee: this.feeReserve,
      });

      const run = await this.runs.create(
        {
          userId,
          trigger,
          creditTransactionId: credit?.id ?? null,
          status: 'processing',
          baseAmount,
          availableAmount: available,
          skipped: plan.skipped,
        } as CreationAttributes<SplitRun>,
        { transaction: t },
      );

      const clearing = await this.ledger.getSystemAccount(SYSTEM_ACCOUNTS.PAYOUT_CLEARING, t);
      const payoutIds: string[] = [];
      for (const { rule, amount, fee } of plan.items) {
        if (rule.destinationType === 'wallet') {
          await this.ledger.post(
            {
              userId,
              type: T.WALLET_ALLOCATION,
              amount,
              categoryId: rule.wallet!.categoryId,
              walletId: rule.walletId,
              splitRuleId: rule.id,
              splitRunId: run.id,
              narration: rule.name,
              legs: [
                { accountId: salary.id, amount: -amount },
                { accountId: walletAccounts.get(rule.walletId!)!, amount },
              ],
            },
            t,
          );
        } else {
          const beneficiary = rule.beneficiary!;
          const payout = await this.ledger.post(
            {
              userId,
              type: T.BENEFICIARY_PAYOUT,
              status: 'pending',
              amount,
              fee,
              categoryId: beneficiary.categoryId,
              beneficiaryId: beneficiary.id,
              splitRuleId: rule.id,
              splitRunId: run.id,
              counterpartyName: beneficiary.accountName,
              narration: beneficiary.narration ?? rule.name,
              metadata: { feeReserve: fee, ...(this.simulation ? { simulated: true } : {}) },
              legs: [
                { accountId: salary.id, amount: -(amount + fee) },
                { accountId: clearing.id, amount: amount + fee },
              ],
            },
            t,
          );
          payoutIds.push(payout.id);
        }
      }
      return { run, payoutIds };
    });

    this.logger.log(
      `Split run ${run.id} (${trigger}) for user ${userId}: ${payoutIds.length} payout(s)`,
    );
    for (const id of payoutIds) await this.payouts.dispatch(id);
    return (await this.payouts.refreshRunStatus(run.id)) ?? run;
  }
}

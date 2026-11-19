import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { Op, UniqueConstraintError } from 'sequelize';
import { randomUUID } from 'crypto';
import { HepaidService } from '../../../integration/hepaid/hepaid.service';
import { HepaidError } from '../../../integration/hepaid/hepaid.error';
import { HepaidWalletEntry } from '../../../integration/hepaid/hepaid.types';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/services/users.service';
import { LedgerService } from '../../ledger/services/ledger.service';
import { LedgerTransaction } from '../../ledger/entities/ledger-transaction.entity';
import {
  LEDGER_TRANSACTION_TYPES as T,
  SYSTEM_ACCOUNTS,
} from '../../ledger/constants/ledger.constants';
import {
  TransactionQueryService,
  TransactionReceipt,
} from '../../ledger/services/transaction-query.service';
import { SalaryAccount } from '../../salary-account/entities/salary-account.entity';
import { IncomeService } from '../../income/services/income.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { AppError } from '../../../shared/utils/app-error.util';
import { FULL_BPS, formatNaira } from '../../../shared/utils/money.util';
import {
  AUTO_SPLIT_MIN_SHARE_BPS,
  SPLIT_ENGINE_ERROR_CODES as E,
} from '../constants/split-engine.constants';
import { SplitEngineService, SplitRunDetail } from './split-engine.service';

export interface CreditInput {
  userId: string;
  amount: number;

  providerReference: string;
  counterpartyName?: string | null;
  narration?: string | null;
  metadata?: Record<string, unknown>;
}

export interface SimulateCreditResult {
  transaction: TransactionReceipt;

  autoSplit: boolean;
  splitRun: SplitRunDetail | null;
}

export interface CreditSyncResult {
  accounts: number;
  credits: number;
  errors: number;
}

function isSalaryEntry(entry: HepaidWalletEntry, mode: SalaryAccount['mode']): boolean {
  if (entry.amount <= 0) return false;
  return entry.type === 'TopUp' || (entry.type === 'Credit' && mode === 'Test');
}
const SYNC_PAGE_SIZE = 50;
const SYNC_MAX_PAGES = 3;

@Injectable()
export class CreditService {
  private readonly logger = new Logger(CreditService.name);
  private readonly simulation: boolean;

  constructor(
    configService: ConfigService,
    private readonly hepaid: HepaidService,
    private readonly ledger: LedgerService,
    private readonly transactionsQuery: TransactionQueryService,
    private readonly income: IncomeService,
    private readonly notifications: NotificationsService,
    private readonly users: UsersService,
    private readonly engine: SplitEngineService,
    @InjectModel(SalaryAccount) private readonly salaryAccounts: typeof SalaryAccount,
    @InjectModel(LedgerTransaction) private readonly transactions: typeof LedgerTransaction,
  ) {
    this.simulation = configService.get<boolean>('payments.simulation', false);
  }

  async record(input: CreditInput): Promise<LedgerTransaction | null> {
    try {
      return await this.ledger.inTransaction(async (t) => {
        const [salary, inflow] = await Promise.all([
          this.ledger.getOrCreateSalaryAccount(input.userId, t),
          this.ledger.getSystemAccount(SYSTEM_ACCOUNTS.EXTERNAL_INFLOW, t),
        ]);
        return this.ledger.post(
          {
            userId: input.userId,
            type: T.SALARY_CREDIT,
            amount: input.amount,
            counterpartyName: input.counterpartyName?.slice(0, 200) ?? null,
            narration: input.narration?.slice(0, 200) ?? null,
            providerReference: input.providerReference,
            metadata: input.metadata ?? null,
            legs: [
              { accountId: inflow.id, amount: -input.amount },
              { accountId: salary.id, amount: input.amount },
            ],
          },
          t,
        );
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) return null;
      throw error;
    }
  }

  async afterCredit(user: User, credit: LedgerTransaction): Promise<SplitRunDetail | null> {
    try {
      const profile = await this.income.findByUserId(user.id);
      const auto =
        user.kycStatus === 'approved' &&
        profile !== null &&
        credit.amount * FULL_BPS >= profile.monthlyAmount * AUTO_SPLIT_MIN_SHARE_BPS;

      await this.notifications.notify(user, {
        type: 'salary_received',
        topic: 'salaryReceived',
        title: 'Money received',
        body: auto
          ? `${formatNaira(credit.amount)} arrived in your salary account. Splitting it now.`
          : `${formatNaira(credit.amount)} arrived in your salary account. It wasn't split automatically because it's less than half your expected salary. Tap Run Now to split it.`,
        data: { transactionId: credit.id, autoSplit: auto },
        email: true,
      });
      if (!auto) return null;

      const run = await this.engine.runForCredit(user.id, credit);
      return run ? await this.engine.get(user.id, run.id) : null;
    } catch (error) {
      this.logger.error(
        `Post-credit handling failed for ${credit.id}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  async simulate(
    user: User,
    input: { amount: number; senderName?: string; narration?: string },
  ): Promise<SimulateCreditResult> {
    if (!this.simulation) {
      throw AppError.forbidden(
        E.SIMULATION_DISABLED,
        'Simulated credits are disabled on this environment.',
      );
    }
    const credit = await this.record({
      userId: user.id,
      amount: input.amount,
      providerReference: `sim:${randomUUID()}`,
      counterpartyName: input.senderName ?? 'Simulated employer',
      narration: input.narration ?? 'Simulated salary credit',
      metadata: { simulated: true },
    });
    const splitRun = await this.afterCredit(user, credit!);
    return {
      transaction: (await this.transactionsQuery.findReceipt(user.id, credit!.id))!,
      autoSplit: splitRun !== null,
      splitRun,
    };
  }

  async syncFromProvider(limit = 100): Promise<CreditSyncResult> {
    const result: CreditSyncResult = { accounts: 0, credits: 0, errors: 0 };
    if (!this.hepaid.isConfigured) return result;

    const accounts = await this.salaryAccounts.findAll({
      where: { status: 'active' },
      order: [['creditsSyncedAt', 'ASC NULLS FIRST']],
      limit,
    });
    for (const account of accounts) {
      result.accounts++;
      try {
        result.credits += await this.syncAccount(account);
        await account.update({ creditsSyncedAt: new Date() });
      } catch (error) {
        result.errors++;
        const code = error instanceof HepaidError ? error.code : (error as Error).message;
        this.logger.warn(`Credit sync failed for salary account ${account.id}: ${code}`);
      }
    }
    return result;
  }

  async syncWallet(walletReference: string): Promise<number | null> {
    const account = await this.salaryAccounts.findOne({
      where: { providerReference: walletReference, status: 'active' },
    });
    if (!account) return null;
    const recorded = await this.syncAccount(account);
    await account.update({ creditsSyncedAt: new Date() });
    return recorded;
  }

  private async syncAccount(account: SalaryAccount): Promise<number> {
    const fresh: HepaidWalletEntry[] = [];
    for (let page = 1; page <= SYNC_MAX_PAGES; page++) {
      const { items } = await this.hepaid.listWalletTransactions(
        account.providerReference,
        page,
        SYNC_PAGE_SIZE,
      );
      const inbound = items.filter((entry) => isSalaryEntry(entry, account.mode));
      const known = await this.knownReferences(
        inbound.map((entry) => CreditService.providerReference(entry)),
      );
      fresh.push(...inbound.filter((e) => !known.has(CreditService.providerReference(e))));

      if (known.size > 0 || items.length < SYNC_PAGE_SIZE) break;
    }
    if (fresh.length === 0) return 0;

    const user = await this.users.findById(account.userId);
    if (!user) return 0;
    let recorded = 0;

    fresh.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const entry of fresh) {
      const credit = await this.record({
        userId: account.userId,
        amount: entry.amount,
        providerReference: CreditService.providerReference(entry),

        counterpartyName: entry.sender?.accountName ?? null,
        metadata: {
          hepaidEntryId: entry.id,
          hepaidType: entry.type,
          receivedAt: entry.createdAt,
          ...(entry.sender
            ? {
                senderBankCode: entry.sender.bankCode,
                senderAccountLast4: entry.sender.accountNumber?.slice(-4) ?? null,
                sessionId: entry.sender.sessionId,
              }
            : {}),
        },
      });
      if (!credit) continue;
      recorded++;
      this.logger.log(`Salary credit ${credit.reference} recorded for user ${account.userId}`);
      await this.afterCredit(user, credit);
    }
    return recorded;
  }

  private async knownReferences(references: string[]): Promise<Set<string>> {
    if (references.length === 0) return new Set();
    const rows = await this.transactions.findAll({
      attributes: ['providerReference'],
      where: { providerReference: { [Op.in]: references } },
    });
    return new Set(rows.map((row) => row.providerReference!));
  }

  static providerReference(entry: HepaidWalletEntry): string {
    return `hepaid:entry:${entry.id}`;
  }
}

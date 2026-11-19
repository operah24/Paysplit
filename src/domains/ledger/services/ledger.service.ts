import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { CreationAttributes, Transaction, UniqueConstraintError } from 'sequelize';
import { randomInt } from 'crypto';
import { LedgerAccount } from '../entities/ledger-account.entity';
import { LedgerTransaction } from '../entities/ledger-transaction.entity';
import { LedgerEntry } from '../entities/ledger-entry.entity';
import {
  DEFAULT_CURRENCY,
  LedgerTransactionStatus,
  LedgerTransactionType,
  SystemAccountCode,
} from '../constants/ledger.constants';
import { lagosToday } from '../../../shared/utils/payday.util';

export class InsufficientFundsError extends Error {
  constructor(
    readonly accountId: string,
    readonly available: number,
    readonly required: number,
  ) {
    super('Insufficient balance');
    this.name = 'InsufficientFundsError';
  }
}

export interface LedgerLeg {
  accountId: string;

  amount: number;
}

export interface PostTransactionInput {
  userId: string;
  type: LedgerTransactionType;
  status?: LedgerTransactionStatus;

  amount: number;
  fee?: number;
  categoryId?: string | null;
  walletId?: string | null;
  beneficiaryId?: string | null;
  splitRuleId?: string | null;
  splitRunId?: string | null;
  counterpartyName?: string | null;
  narration?: string | null;
  providerReference?: string | null;
  metadata?: Record<string, unknown> | null;

  legs: LedgerLeg[];
}

export interface SettleTransactionInput {
  status: LedgerTransactionStatus;

  legs: LedgerLeg[];
  fee?: number;
  providerReference?: string | null;

  metadata?: Record<string, unknown>;
}

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const pad = (n: number) => String(n).padStart(2, '0');

@Injectable()
export class LedgerService {
  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    @InjectModel(LedgerAccount) private readonly accounts: typeof LedgerAccount,
    @InjectModel(LedgerTransaction) private readonly transactions: typeof LedgerTransaction,
    @InjectModel(LedgerEntry) private readonly entries: typeof LedgerEntry,
  ) {}

  inTransaction<T>(work: (t: Transaction) => Promise<T>): Promise<T> {
    return this.sequelize.transaction(work);
  }

  async getOrCreateSalaryAccount(userId: string, t?: Transaction): Promise<LedgerAccount> {
    const existing = await this.findSalaryAccount(userId, t);
    if (existing) return existing;
    try {
      return await this.accounts.create(
        { userId, type: 'salary', currency: DEFAULT_CURRENCY } as CreationAttributes<LedgerAccount>,
        { transaction: t },
      );
    } catch (error) {
      if (error instanceof UniqueConstraintError && !t) {
        return (await this.findSalaryAccount(userId))!;
      }
      throw error;
    }
  }

  findSalaryAccount(userId: string, t?: Transaction): Promise<LedgerAccount | null> {
    return this.accounts.findOne({
      where: { userId, type: 'salary', currency: DEFAULT_CURRENCY },
      transaction: t,
    });
  }

  createWalletAccount(userId: string, walletId: string, t?: Transaction): Promise<LedgerAccount> {
    return this.accounts.create(
      {
        userId,
        walletId,
        type: 'wallet',
        currency: DEFAULT_CURRENCY,
      } as CreationAttributes<LedgerAccount>,
      { transaction: t },
    );
  }

  lockAccount(id: string, t: Transaction): Promise<LedgerAccount | null> {
    return this.accounts.findByPk(id, { lock: t.LOCK.UPDATE, transaction: t });
  }

  findWalletAccount(walletId: string, t?: Transaction): Promise<LedgerAccount | null> {
    return this.accounts.findOne({ where: { walletId }, transaction: t });
  }

  async getSystemAccount(code: SystemAccountCode, t?: Transaction): Promise<LedgerAccount> {
    const [account] = await this.accounts.findOrCreate({
      where: { type: 'system', code, currency: DEFAULT_CURRENCY },
      defaults: {
        type: 'system',
        code,
        currency: DEFAULT_CURRENCY,
      } as CreationAttributes<LedgerAccount>,
      transaction: t,
    });
    return account;
  }

  async post(input: PostTransactionInput, t: Transaction): Promise<LedgerTransaction> {
    LedgerService.assertBalanced(input.legs);
    const balanceAfter = await this.applyLegs(input.legs, t);

    const status = input.status ?? 'success';
    const transaction = await this.transactions.create(
      {
        userId: input.userId,
        reference: LedgerService.generateReference(),
        type: input.type,
        status,
        amount: input.amount,
        fee: input.fee ?? 0,
        currency: DEFAULT_CURRENCY,
        categoryId: input.categoryId ?? null,
        walletId: input.walletId ?? null,
        beneficiaryId: input.beneficiaryId ?? null,
        splitRuleId: input.splitRuleId ?? null,
        splitRunId: input.splitRunId ?? null,
        counterpartyName: input.counterpartyName ?? null,
        narration: input.narration ?? null,
        providerReference: input.providerReference ?? null,
        metadata: input.metadata ?? null,
        completedAt: status === 'success' ? new Date() : null,
      } as CreationAttributes<LedgerTransaction>,
      { transaction: t },
    );

    await this.entries.bulkCreate(
      input.legs.map(
        (leg, index) =>
          ({
            transactionId: transaction.id,
            accountId: leg.accountId,
            amount: leg.amount,
            balanceAfter: balanceAfter[index],
          }) as CreationAttributes<LedgerEntry>,
      ),
      { transaction: t },
    );

    return transaction;
  }

  async settle(
    transactionId: string,
    input: SettleTransactionInput,
    t: Transaction,
    from: LedgerTransactionStatus[] = ['pending'],
  ): Promise<LedgerTransaction | null> {
    const tx = await this.transactions.findByPk(transactionId, {
      lock: t.LOCK.UPDATE,
      transaction: t,
    });
    if (!tx || !from.includes(tx.status)) return null;

    const legs = input.legs.filter((leg) => leg.amount !== 0);
    LedgerService.assertBalanced(legs);
    const balanceAfter = await this.applyLegs(legs, t);
    await this.entries.bulkCreate(
      legs.map(
        (leg, index) =>
          ({
            transactionId: tx.id,
            accountId: leg.accountId,
            amount: leg.amount,
            balanceAfter: balanceAfter[index],
          }) as CreationAttributes<LedgerEntry>,
      ),
      { transaction: t },
    );

    return tx.update(
      {
        status: input.status,
        ...(input.fee !== undefined ? { fee: input.fee } : {}),
        ...(input.providerReference !== undefined
          ? { providerReference: input.providerReference }
          : {}),
        metadata: { ...(tx.metadata ?? {}), ...(input.metadata ?? {}) },
        completedAt: input.status === 'pending' ? null : new Date(),
      },
      { transaction: t },
    );
  }

  private async applyLegs(legs: LedgerLeg[], t: Transaction): Promise<number[]> {
    const accountIds = [...new Set(legs.map((leg) => leg.accountId))].sort();
    const locked = await this.accounts.findAll({
      where: { id: accountIds },
      lock: t.LOCK.UPDATE,
      transaction: t,
      order: [['id', 'ASC']],
    });
    if (locked.length !== accountIds.length) {
      throw new Error('Ledger account not found');
    }

    const balances = new Map(locked.map((account) => [account.id, account.balance]));
    const types = new Map(locked.map((account) => [account.id, account.type]));
    const balanceAfter: number[] = [];
    for (const leg of legs) {
      const next = balances.get(leg.accountId)! + leg.amount;
      if (next < 0 && types.get(leg.accountId) !== 'system') {
        throw new InsufficientFundsError(
          leg.accountId,
          balances.get(leg.accountId)!,
          Math.abs(leg.amount),
        );
      }
      balances.set(leg.accountId, next);
      balanceAfter.push(next);
    }

    for (const account of locked) {
      await account.update({ balance: balances.get(account.id)! }, { transaction: t });
    }
    return balanceAfter;
  }

  static assertBalanced(legs: LedgerLeg[]): void {
    if (legs.length < 2) throw new Error('A ledger transaction needs at least two legs');
    if (legs.some((leg) => !Number.isSafeInteger(leg.amount) || leg.amount === 0)) {
      throw new Error('Ledger legs must be non-zero integer amounts');
    }
    const sum = legs.reduce((total, leg) => total + leg.amount, 0);
    if (sum !== 0) throw new Error(`Ledger legs must sum to zero (got ${sum})`);
  }

  static generateReference(now: Date = new Date()): string {
    const { year, monthIndex, day } = lagosToday(now);
    let suffix = '';
    for (let i = 0; i < 6; i++) suffix += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
    return `PAY-${year}${pad(monthIndex + 1)}${pad(day)}-${suffix}`;
  }
}

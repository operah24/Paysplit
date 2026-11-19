import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Op, QueryTypes, WhereOptions } from 'sequelize';
import { LedgerTransaction } from '../entities/ledger-transaction.entity';
import { Wallet } from '../../wallets/entities/wallet.entity';
import { Beneficiary, maskAccountNumber } from '../../beneficiaries/entities/beneficiary.entity';
import { Category, CategoryView, toCategoryView } from '../../categories/entities/category.entity';
import {
  LEDGER_TRANSACTION_TYPES as T,
  LedgerTransactionStatus,
  LedgerTransactionType,
} from '../constants/ledger.constants';
import { PaginatedResult } from '../../../shared/utils/pagination.utils';
import { toMinor } from '../../../shared/utils/money.util';

export type TransactionPerspective = 'salary' | 'wallet';

export interface TransactionFilter {
  types?: LedgerTransactionType[];
  status?: LedgerTransactionStatus;
  walletId?: string;

  anyWallet?: boolean;
  beneficiaryId?: string;
  splitRuleId?: string;

  splitRunId?: string;
  search?: string;
  from?: Date;
  to?: Date;
}

export interface TransactionDestination {
  type: 'wallet' | 'beneficiary' | 'salary_account';
  id: string | null;
  name: string;
}

export interface TransactionView {
  id: string;
  reference: string;
  type: LedgerTransactionType;
  status: LedgerTransactionStatus;

  title: string;
  direction: 'in' | 'out';

  amount: number;

  signedAmount: number;
  fee: number;
  currency: string;
  category: CategoryView | null;
  destination: TransactionDestination;
  narration: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface TransactionReceipt extends TransactionView {
  recipient: {
    name: string;
    type: TransactionDestination['type'];
    bankName: string | null;
    maskedAccountNumber: string | null;
  };
  settlementReference: string;
  providerReference: string | null;
  splitRuleId: string | null;
}

export interface CashFlowBucket {
  period: string;
  inflow: number;
  toWallets: number;
  toBeneficiaries: number;
  movedBack: number;
}

const SALARY_DIRECTION: Record<LedgerTransactionType, 'in' | 'out'> = {
  [T.SALARY_CREDIT]: 'in',
  [T.WALLET_ALLOCATION]: 'out',
  [T.BENEFICIARY_PAYOUT]: 'out',
  [T.WALLET_WITHDRAWAL]: 'in',
};

const WALLET_DIRECTION: Partial<Record<LedgerTransactionType, 'in' | 'out'>> = {
  [T.WALLET_ALLOCATION]: 'in',
  [T.WALLET_WITHDRAWAL]: 'out',
};

export function typesForDirection(
  direction: 'in' | 'out',
  perspective: TransactionPerspective,
): LedgerTransactionType[] {
  const map = perspective === 'wallet' ? WALLET_DIRECTION : SALARY_DIRECTION;
  return (Object.keys(map) as LedgerTransactionType[]).filter((type) => map[type] === direction);
}

@Injectable()
export class TransactionQueryService {
  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    @InjectModel(LedgerTransaction) private readonly transactions: typeof LedgerTransaction,
  ) {}

  async list(
    userId: string,
    filter: TransactionFilter,
    pagination: { page: number; limit: number },
    perspective: TransactionPerspective = 'salary',
  ): Promise<PaginatedResult<TransactionView>> {
    const page = Math.max(1, pagination.page || 1);
    const limit = Math.max(1, pagination.limit || 10);

    const { count, rows } = await this.transactions.findAndCountAll({
      where: this.buildWhere(userId, filter),
      include: TransactionQueryService.includes(),
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit,
      offset: (page - 1) * limit,
      subQuery: false,
      distinct: true,
    });

    return {
      data: rows.map((row) => TransactionQueryService.toView(row, perspective)),
      pagination: { total: count, page, limit, pages: Math.ceil(count / limit) },
    };
  }

  async listForExport(
    userId: string,
    filter: TransactionFilter,
    max: number,
  ): Promise<TransactionReceipt[]> {
    const rows = await this.transactions.findAll({
      where: this.buildWhere(userId, filter),
      include: TransactionQueryService.includes(),
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: max,
      subQuery: false,
    });
    return rows.map((row) => TransactionQueryService.toReceipt(row));
  }

  async findReceipt(userId: string, id: string): Promise<TransactionReceipt | null> {
    const row = await this.transactions.findOne({
      where: { id, userId },
      include: TransactionQueryService.includes(),
    });
    return row ? TransactionQueryService.toReceipt(row) : null;
  }

  async findReceiptByReference(
    userId: string,
    reference: string,
  ): Promise<TransactionReceipt | null> {
    const row = await this.transactions.findOne({
      where: { reference, userId },
      include: TransactionQueryService.includes(),
    });
    return row ? TransactionQueryService.toReceipt(row) : null;
  }

  async sumByType(
    userId: string,
    scope: { walletId?: string; beneficiaryId?: string; since?: Date } = {},
  ): Promise<Partial<Record<LedgerTransactionType, number>>> {
    const where: WhereOptions = { userId, status: 'success' };
    if (scope.walletId) Object.assign(where, { walletId: scope.walletId });
    if (scope.beneficiaryId) Object.assign(where, { beneficiaryId: scope.beneficiaryId });
    if (scope.since) Object.assign(where, { createdAt: { [Op.gte]: scope.since } });

    const rows = (await this.transactions.findAll({
      attributes: ['type', [Sequelize.fn('SUM', Sequelize.col('amount')), 'total']],
      where,
      group: ['type'],
      raw: true,
    })) as unknown as { type: LedgerTransactionType; total: string }[];

    return Object.fromEntries(rows.map((row) => [row.type, toMinor(row.total)]));
  }

  async allocatedByRule(userId: string, since: Date): Promise<Map<string, number>> {
    const rows = (await this.transactions.findAll({
      attributes: ['splitRuleId', [Sequelize.fn('SUM', Sequelize.col('amount')), 'total']],
      where: {
        userId,
        status: 'success',
        splitRuleId: { [Op.ne]: null },
        createdAt: { [Op.gte]: since },
      },
      group: ['splitRuleId'],
      raw: true,
    })) as unknown as { splitRuleId: string; total: string }[];
    return new Map(rows.map((row) => [row.splitRuleId, toMinor(row.total)]));
  }

  async payoutsByBeneficiary(userId: string): Promise<Map<string, number>> {
    const rows = (await this.transactions.findAll({
      attributes: ['beneficiaryId', [Sequelize.fn('SUM', Sequelize.col('amount')), 'total']],
      where: { userId, status: 'success', type: T.BENEFICIARY_PAYOUT },
      group: ['beneficiaryId'],
      raw: true,
    })) as unknown as { beneficiaryId: string; total: string }[];
    return new Map(rows.map((row) => [row.beneficiaryId, toMinor(row.total)]));
  }

  async cashFlow(
    userId: string,
    from: Date,
    to: Date,
    granularity: 'day' | 'month',
  ): Promise<CashFlowBucket[]> {
    const format = granularity === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';
    const rows = await this.sequelize.query<{
      period: string;
      inflow: string;
      to_wallets: string;
      to_beneficiaries: string;
      moved_back: string;
    }>(
      `SELECT to_char(date_trunc(:granularity, created_at AT TIME ZONE 'Africa/Lagos'), :format) AS period,
              SUM(amount) FILTER (WHERE type = :salaryCredit)   AS inflow,
              SUM(amount) FILTER (WHERE type = :allocation)     AS to_wallets,
              SUM(amount) FILTER (WHERE type = :payout)         AS to_beneficiaries,
              SUM(amount) FILTER (WHERE type = :withdrawal)     AS moved_back
         FROM ledger_transactions
        WHERE user_id = :userId AND status = 'success'
          AND created_at >= :from AND created_at < :to
        GROUP BY 1`,
      {
        type: QueryTypes.SELECT,
        replacements: {
          userId,
          from,
          to,
          granularity,
          format,
          salaryCredit: T.SALARY_CREDIT,
          allocation: T.WALLET_ALLOCATION,
          payout: T.BENEFICIARY_PAYOUT,
          withdrawal: T.WALLET_WITHDRAWAL,
        },
      },
    );

    const byPeriod = new Map(rows.map((row) => [row.period, row]));
    return TransactionQueryService.periods(from, to, granularity).map((period) => {
      const row = byPeriod.get(period);
      return {
        period,
        inflow: toMinor(row?.inflow),
        toWallets: toMinor(row?.to_wallets),
        toBeneficiaries: toMinor(row?.to_beneficiaries),
        movedBack: toMinor(row?.moved_back),
      };
    });
  }

  private buildWhere(userId: string, filter: TransactionFilter): WhereOptions {
    const and: WhereOptions[] = [{ userId }];
    if (filter.types) and.push({ type: { [Op.in]: filter.types } });
    if (filter.status) and.push({ status: filter.status });
    if (filter.walletId) and.push({ walletId: filter.walletId });
    if (filter.anyWallet) and.push({ walletId: { [Op.ne]: null } });
    if (filter.beneficiaryId) and.push({ beneficiaryId: filter.beneficiaryId });
    if (filter.splitRuleId) and.push({ splitRuleId: filter.splitRuleId });
    if (filter.splitRunId) and.push({ splitRunId: filter.splitRunId });
    if (filter.from) and.push({ createdAt: { [Op.gte]: filter.from } });
    if (filter.to) and.push({ createdAt: { [Op.lt]: filter.to } });

    const search = filter.search?.trim();
    if (search) {
      const like = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      and.push({
        [Op.or]: [
          { reference: { [Op.iLike]: like } },
          { counterpartyName: { [Op.iLike]: like } },
          { narration: { [Op.iLike]: like } },
          { '$wallet.name$': { [Op.iLike]: like } },
          { '$beneficiary.account_name$': { [Op.iLike]: like } },
          { '$category.name$': { [Op.iLike]: like } },
        ],
      });
    }
    return { [Op.and]: and };
  }

  private static includes() {
    return [
      { model: Wallet, attributes: ['id', 'name'], paranoid: false, required: false },
      {
        model: Beneficiary,
        attributes: ['id', 'accountName', 'bankName', 'accountNumber'],
        paranoid: false,
        required: false,
      },
      { model: Category, attributes: ['id', 'name', 'slug'], paranoid: false, required: false },
    ];
  }

  static toView(row: LedgerTransaction, perspective: TransactionPerspective): TransactionView {
    const direction =
      (perspective === 'wallet' ? WALLET_DIRECTION[row.type] : undefined) ??
      SALARY_DIRECTION[row.type];
    const walletName = row.wallet?.name ?? 'Wallet';
    const beneficiaryName = row.beneficiary?.accountName ?? row.counterpartyName ?? 'Beneficiary';

    let title: string;
    let destination: TransactionDestination;
    switch (row.type) {
      case T.SALARY_CREDIT:
        title = `Transfer from ${row.counterpartyName ?? 'salary source'}`;
        destination = { type: 'salary_account', id: null, name: 'Salary Account' };
        break;
      case T.WALLET_ALLOCATION:
        title = perspective === 'wallet' ? 'Split from Salary' : `${walletName} Wallet`;
        destination = { type: 'wallet', id: row.walletId, name: walletName };
        break;
      case T.WALLET_WITHDRAWAL:
        title = perspective === 'wallet' ? 'Moved to Salary Account' : `Moved from ${walletName}`;
        destination = { type: 'salary_account', id: null, name: 'Salary Account' };
        break;
      case T.BENEFICIARY_PAYOUT:
      default:
        title = `Transfer to ${beneficiaryName}`;
        destination = { type: 'beneficiary', id: row.beneficiaryId, name: beneficiaryName };
        break;
    }

    return {
      id: row.id,
      reference: row.reference,
      type: row.type,
      status: row.status,
      title,
      direction,
      amount: row.amount,
      signedAmount: direction === 'out' ? -row.amount : row.amount,
      fee: row.fee,
      currency: row.currency,
      category: toCategoryView(row.category),
      destination,
      narration: row.narration,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
    };
  }

  static toReceipt(row: LedgerTransaction): TransactionReceipt {
    const view = TransactionQueryService.toView(row, 'salary');
    const recipientName =
      row.type === T.WALLET_ALLOCATION
        ? (row.wallet?.name ?? 'Wallet')
        : row.type === T.BENEFICIARY_PAYOUT
          ? view.destination.name
          : 'Salary Account';
    const recipientType: TransactionDestination['type'] =
      row.type === T.WALLET_ALLOCATION
        ? 'wallet'
        : row.type === T.BENEFICIARY_PAYOUT
          ? 'beneficiary'
          : 'salary_account';

    return {
      ...view,
      recipient: {
        name: recipientName,
        type: recipientType,
        bankName: row.beneficiary?.bankName ?? null,
        maskedAccountNumber: row.beneficiary?.accountNumber
          ? maskAccountNumber(row.beneficiary.accountNumber)
          : null,
      },
      settlementReference: row.reference,
      providerReference: row.providerReference,
      splitRuleId: row.splitRuleId,
    };
  }

  static periods(from: Date, to: Date, granularity: 'day' | 'month'): string[] {
    const lagos = (d: Date) => new Date(d.getTime() + 60 * 60 * 1000);
    const start = lagos(from);
    const end = lagos(new Date(to.getTime() - 1));
    const out: string[] = [];
    const cursor = new Date(
      Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth(),
        granularity === 'day' ? start.getUTCDate() : 1,
      ),
    );
    const pad = (n: number) => String(n).padStart(2, '0');
    while (cursor <= end && out.length < 400) {
      const ym = `${cursor.getUTCFullYear()}-${pad(cursor.getUTCMonth() + 1)}`;
      out.push(granularity === 'month' ? ym : `${ym}-${pad(cursor.getUTCDate())}`);
      if (granularity === 'month') cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      else cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return out;
  }
}

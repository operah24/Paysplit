import { Injectable } from '@nestjs/common';
import {
  TransactionFilter,
  TransactionQueryService,
  TransactionReceipt,
  TransactionView,
  typesForDirection,
} from '../../ledger/services/transaction-query.service';
import {
  LEDGER_TRANSACTION_TYPES as T,
  LedgerTransactionType,
} from '../../ledger/constants/ledger.constants';
import { TransactionFilterQuery } from '../dtos/transaction.dtos';
import { AppError } from '../../../shared/utils/app-error.util';
import { PaginatedResult } from '../../../shared/utils/pagination.utils';
import { formatMajor } from '../../../shared/utils/money.util';
import { lagosDayEnd, lagosDayStart } from '../../../shared/utils/payday.util';

export const EXPORT_MAX_ROWS = 5_000;

const CSV_BOM = String.fromCharCode(0xfeff);

const TYPE_TABS: Record<string, LedgerTransactionType[] | undefined> = {
  all: undefined,
  wallet: [T.WALLET_ALLOCATION, T.WALLET_WITHDRAWAL],
  beneficiary: [T.BENEFICIARY_PAYOUT],
  salary: [T.SALARY_CREDIT],
};

const TYPE_LABELS: Record<LedgerTransactionType, string> = {
  [T.SALARY_CREDIT]: 'Salary credit',
  [T.WALLET_ALLOCATION]: 'Split to wallet',
  [T.BENEFICIARY_PAYOUT]: 'Split to beneficiary',
  [T.WALLET_WITHDRAWAL]: 'Moved back to salary',
};

@Injectable()
export class TransactionsService {
  constructor(private readonly query: TransactionQueryService) {}

  list(
    userId: string,
    filters: TransactionFilterQuery,
    pagination: { page: number; limit: number },
  ): Promise<PaginatedResult<TransactionView>> {
    return this.query.list(userId, TransactionsService.toFilter(filters), pagination);
  }

  async receipt(userId: string, id: string): Promise<TransactionReceipt> {
    const receipt = await this.query.findReceipt(userId, id);
    if (!receipt) throw AppError.notFound('TRANSACTION_NOT_FOUND', 'Transaction not found.');
    return receipt;
  }

  async exportCsv(userId: string, filters: TransactionFilterQuery): Promise<string> {
    const rows = await this.query.listForExport(
      userId,
      TransactionsService.toFilter(filters),
      EXPORT_MAX_ROWS,
    );
    const header = [
      'Reference',
      'Date (WAT)',
      'Type',
      'Description',
      'Destination',
      'Category',
      'Status',
      'Direction',
      'Amount (NGN)',
      'Fee (NGN)',
      'Narration',
    ];
    const lines = rows.map((row) =>
      [
        row.reference,
        TransactionsService.formatLagos(row.createdAt),
        TYPE_LABELS[row.type] ?? row.type,
        row.title,
        row.destination.name,
        row.category?.name ?? '',
        row.status,
        row.direction,
        `${row.direction === 'out' ? '-' : ''}${formatMajor(row.amount)}`,
        formatMajor(row.fee),
        row.narration ?? '',
      ]
        .map((cell) => TransactionsService.csvCell(cell))
        .join(','),
    );

    return `${CSV_BOM}${[header.join(','), ...lines].join('\r\n')}\r\n`;
  }

  static toFilter(filters: TransactionFilterQuery): TransactionFilter {
    let types = TYPE_TABS[filters.type ?? 'all'];
    if (filters.direction && filters.direction !== 'all') {
      const directional = typesForDirection(filters.direction, 'salary');
      types = types ? types.filter((type) => directional.includes(type)) : directional;
    }
    const from = filters.from ? lagosDayStart(filters.from) : undefined;
    const to = filters.to ? lagosDayEnd(filters.to) : undefined;
    if (from && to && from >= to) {
      throw AppError.badRequest('INVALID_DATE_RANGE', '`from` must be on or before `to`.');
    }
    return { types, status: filters.status, search: filters.search, from, to };
  }

  static csvCell(value: string): string {
    let cell = value ?? '';
    if (/^[=+\-@\t\r]/.test(cell) && !/^-[\d,.]+$/.test(cell)) cell = `'${cell}`;
    return `"${cell.replace(/"/g, '""')}"`;
  }

  static formatLagos(date: Date): string {
    const lagos = new Date(date.getTime() + 60 * 60 * 1000);
    return lagos.toISOString().slice(0, 16).replace('T', ' ');
  }
}

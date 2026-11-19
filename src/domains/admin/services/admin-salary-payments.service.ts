import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, WhereOptions } from 'sequelize';
import { User } from '../../users/entities/user.entity';
import { LedgerTransaction } from '../../ledger/entities/ledger-transaction.entity';
import {
  LEDGER_TRANSACTION_TYPES as T,
  LedgerTransactionStatus,
} from '../../ledger/constants/ledger.constants';
import {
  TransactionQueryService,
  TransactionReceipt,
} from '../../ledger/services/transaction-query.service';
import { TransactionsService } from '../../transactions/services/transactions.service';
import { AdminSalaryPaymentsQuery } from '../dtos/admin.dtos';
import { ADMIN_ERROR_CODES } from './admin-users.service';
import { AppError } from '../../../shared/utils/app-error.util';
import { PaginatedResult } from '../../../shared/utils/pagination.utils';

export interface AdminPaymentEmployee {
  id: string;
  fullName: string;
  email: string;
  profileImageUrl: string | null;
}

export interface AdminSalaryPaymentRow {
  id: string;

  reference: string;
  status: LedgerTransactionStatus;

  amount: number;
  fee: number;
  currency: string;

  source: string | null;
  narration: string | null;
  providerReference: string | null;
  employee: AdminPaymentEmployee;
  createdAt: Date;
  completedAt: Date | null;
}

export interface AdminSalaryPaymentDetail extends TransactionReceipt {
  employee: AdminPaymentEmployee;
}

@Injectable()
export class AdminSalaryPaymentsService {
  constructor(
    @InjectModel(LedgerTransaction) private readonly transactions: typeof LedgerTransaction,
    private readonly query: TransactionQueryService,
  ) {}

  async list(query: AdminSalaryPaymentsQuery): Promise<PaginatedResult<AdminSalaryPaymentRow>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, query.limit ?? 10);
    const { from, to } = TransactionsService.toFilter({ from: query.from, to: query.to });

    const and: WhereOptions[] = [{ type: T.SALARY_CREDIT }];
    if (query.status) and.push({ status: query.status });
    if (query.userId) and.push({ userId: query.userId });
    if (from) and.push({ createdAt: { [Op.gte]: from } });
    if (to) and.push({ createdAt: { [Op.lt]: to } });

    const search = query.search?.trim();
    if (search) {
      const like = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      and.push({
        [Op.or]: [
          { reference: { [Op.iLike]: like } },
          { counterpartyName: { [Op.iLike]: like } },
          { '$user.email$': { [Op.iLike]: like } },
          { '$user.first_name$': { [Op.iLike]: like } },
          { '$user.last_name$': { [Op.iLike]: like } },
        ],
      });
    }

    const { count, rows } = await this.transactions.findAndCountAll({
      where: { [Op.and]: and },
      include: [AdminSalaryPaymentsService.employeeInclude()],
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
      data: rows.map((row) => AdminSalaryPaymentsService.toRow(row)),
      pagination: { total: count, page, limit, pages: Math.ceil(count / limit) },
    };
  }

  async get(reference: string): Promise<AdminSalaryPaymentDetail> {
    const row = await this.transactions.findOne({
      where: { reference, type: T.SALARY_CREDIT },
      include: [AdminSalaryPaymentsService.employeeInclude()],
    });
    const receipt = row && (await this.query.findReceipt(row.userId, row.id));
    if (!row || !receipt) {
      throw AppError.notFound(
        ADMIN_ERROR_CODES.SALARY_PAYMENT_NOT_FOUND,
        'Salary payment not found.',
      );
    }
    return { ...receipt, employee: AdminSalaryPaymentsService.employee(row.user) };
  }

  private static employeeInclude() {
    return {
      model: User,
      attributes: ['id', 'firstName', 'lastName', 'email', 'profileImageUrl'],
      paranoid: false,
      required: true,
    };
  }

  private static employee(user: User | undefined): AdminPaymentEmployee {
    return {
      id: user?.id ?? '',
      fullName: user ? `${user.firstName} ${user.lastName}`.trim() : 'Unknown',
      email: user?.email ?? '',
      profileImageUrl: user?.profileImageUrl ?? null,
    };
  }

  static toRow(row: LedgerTransaction): AdminSalaryPaymentRow {
    return {
      id: row.id,
      reference: row.reference,
      status: row.status,
      amount: row.amount,
      fee: row.fee,
      currency: row.currency,
      source: row.counterpartyName,
      narration: row.narration,
      providerReference: row.providerReference,
      employee: AdminSalaryPaymentsService.employee(row.user),
      createdAt: row.createdAt,
      completedAt: row.completedAt,
    };
  }
}

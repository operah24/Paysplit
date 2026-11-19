import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { CreationAttributes, Op, UniqueConstraintError, WhereOptions } from 'sequelize';
import { Beneficiary, BeneficiaryStatus, maskAccountNumber } from '../entities/beneficiary.entity';
import { SplitRule } from '../../split-rules/entities/split-rule.entity';
import { Category, CategoryView, toCategoryView } from '../../categories/entities/category.entity';
import { CategoriesService } from '../../categories/services/categories.service';
import { IncomeService } from '../../income/services/income.service';
import { LedgerService } from '../../ledger/services/ledger.service';
import {
  TransactionQueryService,
  TransactionView,
} from '../../ledger/services/transaction-query.service';
import { LEDGER_TRANSACTION_TYPES as T } from '../../ledger/constants/ledger.constants';
import { LinkedRuleView, toLinkedRuleView } from '../../split-rules/utils/rule-view.util';
import { BankLookupService } from './bank-lookup.service';
import {
  BeneficiaryTransactionsQuery,
  CreateBeneficiaryDto,
  ListBeneficiariesQuery,
  UpdateBeneficiaryDto,
} from '../dtos/beneficiary.dtos';
import { AppError } from '../../../shared/utils/app-error.util';
import { PaginatedResult } from '../../../shared/utils/pagination.utils';
import { nextPayday } from '../../../shared/utils/payday.util';

export const BENEFICIARY_ERROR_CODES = {
  BENEFICIARY_NOT_FOUND: 'BENEFICIARY_NOT_FOUND',
  BENEFICIARY_EXISTS: 'BENEFICIARY_EXISTS',
} as const;

export interface BeneficiaryView {
  id: string;
  accountName: string;
  bankCode: string;
  bankName: string;

  maskedAccountNumber: string;
  category: CategoryView | null;
  status: BeneficiaryStatus;

  nextSplitDate: string | null;
  createdAt: Date;
}

export interface BeneficiaryDetail extends BeneficiaryView {
  accountNumber: string;
  narration: string | null;

  totalAllocated: number;
  linkedRule: LinkedRuleView | null;
}

@Injectable()
export class BeneficiariesService {
  private readonly logger = new Logger(BeneficiariesService.name);

  constructor(
    @InjectModel(Beneficiary) private readonly beneficiaries: typeof Beneficiary,
    @InjectModel(SplitRule) private readonly rules: typeof SplitRule,
    private readonly categories: CategoriesService,
    private readonly bankLookup: BankLookupService,
    private readonly income: IncomeService,
    private readonly ledger: LedgerService,
    private readonly transactions: TransactionQueryService,
  ) {}

  async list(
    userId: string,
    query: ListBeneficiariesQuery,
  ): Promise<PaginatedResult<BeneficiaryView>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, query.limit ?? 10);
    const where: WhereOptions<Beneficiary>[] = [{ userId }];
    if (query.status && query.status !== 'all') where.push({ status: query.status });
    const search = query.search?.trim();
    if (search) {
      const like = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      where.push({
        [Op.or]: [
          { accountName: { [Op.iLike]: like } },
          { bankName: { [Op.iLike]: like } },
          { accountNumber: { [Op.like]: `%${search.replace(/\D/g, '') || '-'}` } },
        ],
      });
    }

    const { count, rows } = await this.beneficiaries.findAndCountAll({
      where: { [Op.and]: where },
      include: [Category],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });
    const nextSplit = await this.nextSplitDates(
      userId,
      rows.map((row) => row.id),
    );

    return {
      data: rows.map((row) => BeneficiariesService.toView(row, nextSplit.get(row.id) ?? null)),
      pagination: { total: count, page, limit, pages: Math.ceil(count / limit) },
    };
  }

  async get(userId: string, id: string): Promise<BeneficiaryDetail> {
    const beneficiary = await this.findOwnedOrThrow(userId, id);
    const [rule, sums, nextSplit] = await Promise.all([
      this.rules.findOne({ where: { beneficiaryId: id } }),
      this.transactions.sumByType(userId, { beneficiaryId: id }),
      this.nextSplitDates(userId, [id]),
    ]);
    return {
      ...BeneficiariesService.toView(beneficiary, nextSplit.get(id) ?? null),
      accountNumber: beneficiary.accountNumber,
      narration: beneficiary.narration,
      totalAllocated: sums[T.BENEFICIARY_PAYOUT] ?? 0,
      linkedRule: toLinkedRuleView(rule),
    };
  }

  async create(userId: string, dto: CreateBeneficiaryDto): Promise<BeneficiaryDetail> {
    await this.categories.getSelectableOrThrow(dto.categoryId);
    const existing = await this.beneficiaries.findOne({
      where: { userId, bankCode: dto.bankCode, accountNumber: dto.accountNumber },
    });
    if (existing) throw BeneficiariesService.duplicate();

    const account = await this.bankLookup.resolve(dto.bankCode, dto.accountNumber);
    try {
      const created = await this.beneficiaries.create({
        userId,
        bankCode: account.bankCode,
        bankName: account.bankName,
        accountNumber: account.accountNumber,
        accountName: account.accountName,
        categoryId: dto.categoryId,
        narration: dto.narration || null,
        status: 'active',
      } as CreationAttributes<Beneficiary>);
      return this.get(userId, created.id);
    } catch (error) {
      if (error instanceof UniqueConstraintError) throw BeneficiariesService.duplicate();
      throw error;
    }
  }

  async update(userId: string, id: string, dto: UpdateBeneficiaryDto): Promise<BeneficiaryDetail> {
    const beneficiary = await this.findOwnedOrThrow(userId, id);
    if (dto.categoryId) await this.categories.getSelectableOrThrow(dto.categoryId);

    const changes: Partial<Beneficiary> = {};
    if (dto.categoryId !== undefined) changes.categoryId = dto.categoryId;
    if (dto.narration !== undefined) changes.narration = dto.narration || null;
    if (dto.status !== undefined) changes.status = dto.status;
    await beneficiary.update(changes);
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<{ message: string }> {
    const beneficiary = await this.findOwnedOrThrow(userId, id);
    await this.ledger.inTransaction(async (t) => {
      await this.rules.destroy({ where: { beneficiaryId: id }, transaction: t });
      await beneficiary.destroy({ transaction: t });
    });
    this.logger.log(`Beneficiary ${id} deleted by ${userId}`);
    return { message: 'Beneficiary deleted' };
  }

  async listTransactions(
    userId: string,
    id: string,
    query: BeneficiaryTransactionsQuery,
  ): Promise<PaginatedResult<TransactionView>> {
    await this.findOwnedOrThrow(userId, id);
    return this.transactions.list(
      userId,
      { beneficiaryId: id, search: query.search },
      { page: query.page ?? 1, limit: query.limit ?? 10 },
    );
  }

  async findOwnedOrThrow(userId: string, id: string): Promise<Beneficiary> {
    const beneficiary = await this.beneficiaries.findOne({
      where: { id, userId },
      include: [Category],
    });
    if (!beneficiary) {
      throw AppError.notFound(
        BENEFICIARY_ERROR_CODES.BENEFICIARY_NOT_FOUND,
        'Beneficiary not found.',
      );
    }
    return beneficiary;
  }

  private async nextSplitDates(userId: string, ids: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (!ids.length) return result;
    const profile = await this.income.findByUserId(userId);
    if (!profile) return result;

    const rules = await this.rules.findAll({
      where: { userId, status: 'active', beneficiaryId: { [Op.in]: ids } },
      include: [{ model: Beneficiary, attributes: ['id', 'status'] }],
    });
    const date = nextPayday(profile.paydayDay);
    for (const rule of rules) {
      if (rule.beneficiaryId && rule.beneficiary?.status === 'active') {
        result.set(rule.beneficiaryId, date);
      }
    }
    return result;
  }

  static toView(beneficiary: Beneficiary, nextSplitDate: string | null): BeneficiaryView {
    return {
      id: beneficiary.id,
      accountName: beneficiary.accountName,
      bankCode: beneficiary.bankCode,
      bankName: beneficiary.bankName,
      maskedAccountNumber: maskAccountNumber(beneficiary.accountNumber),
      category: toCategoryView(beneficiary.category),
      status: beneficiary.status,
      nextSplitDate,
      createdAt: beneficiary.createdAt,
    };
  }

  private static duplicate() {
    return AppError.conflict(
      BENEFICIARY_ERROR_CODES.BENEFICIARY_EXISTS,
      'You have already added this account as a beneficiary.',
    );
  }
}

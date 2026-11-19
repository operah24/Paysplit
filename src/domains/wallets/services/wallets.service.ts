import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { CreationAttributes, UniqueConstraintError } from 'sequelize';
import { Wallet } from '../entities/wallet.entity';
import { SplitRule } from '../../split-rules/entities/split-rule.entity';
import { Category, CategoryView, toCategoryView } from '../../categories/entities/category.entity';
import { LedgerAccount } from '../../ledger/entities/ledger-account.entity';
import { CategoriesService } from '../../categories/services/categories.service';
import { InsufficientFundsError, LedgerService } from '../../ledger/services/ledger.service';
import {
  TransactionQueryService,
  TransactionView,
  typesForDirection,
} from '../../ledger/services/transaction-query.service';
import { LEDGER_TRANSACTION_TYPES as T } from '../../ledger/constants/ledger.constants';
import { LinkedRuleView, toLinkedRuleView } from '../../split-rules/utils/rule-view.util';
import {
  WALLET_ACCENT_COLORS,
  WALLET_ERROR_CODES,
  WalletAccentColor,
} from '../constants/wallet.constants';
import {
  CreateWalletDto,
  MoveWalletFundsDto,
  UpdateWalletDto,
  WalletActivityQuery,
  WalletTransactionsQuery,
} from '../dtos/wallet.dtos';
import { AppError } from '../../../shared/utils/app-error.util';
import { PaginatedResult } from '../../../shared/utils/pagination.utils';

export interface WalletView {
  id: string;
  name: string;
  category: CategoryView | null;
  accentColor: WalletAccentColor;
  accentHex: string;

  targetAmount: number | null;

  balance: number;

  progressPercent: number | null;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletDetail extends WalletView {
  stats: {
    availableBalance: number;

    totalAllocated: number;

    totalMovedBack: number;
  };
  linkedRule: LinkedRuleView | null;
}

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(
    @InjectModel(Wallet) private readonly wallets: typeof Wallet,
    @InjectModel(SplitRule) private readonly rules: typeof SplitRule,
    private readonly categories: CategoriesService,
    private readonly ledger: LedgerService,
    private readonly transactions: TransactionQueryService,
  ) {}

  async list(userId: string): Promise<WalletView[]> {
    const rows = await this.wallets.findAll({
      where: { userId },
      include: [Category, LedgerAccount],
      order: [['createdAt', 'ASC']],
    });
    return rows.map((row) => WalletsService.toView(row));
  }

  async get(userId: string, id: string): Promise<WalletDetail> {
    const wallet = await this.findOwnedOrThrow(userId, id);
    const [sums, rule] = await Promise.all([
      this.transactions.sumByType(userId, { walletId: id }),
      this.rules.findOne({ where: { walletId: id } }),
    ]);
    const view = WalletsService.toView(wallet);
    return {
      ...view,
      stats: {
        availableBalance: view.balance,
        totalAllocated: sums[T.WALLET_ALLOCATION] ?? 0,
        totalMovedBack: sums[T.WALLET_WITHDRAWAL] ?? 0,
      },
      linkedRule: toLinkedRuleView(rule),
    };
  }

  async create(userId: string, dto: CreateWalletDto): Promise<WalletView> {
    await this.categories.getSelectableOrThrow(dto.categoryId);
    try {
      const id = await this.ledger.inTransaction(async (t) => {
        const wallet = await this.wallets.create(
          {
            userId,
            name: dto.name,
            categoryId: dto.categoryId,
            accentColor: dto.accentColor,
            targetAmount: dto.targetAmount ?? null,
          } as CreationAttributes<Wallet>,
          { transaction: t },
        );
        await this.ledger.createWalletAccount(userId, wallet.id, t);
        return wallet.id;
      });
      return WalletsService.toView(await this.findOwnedOrThrow(userId, id));
    } catch (error) {
      throw WalletsService.mapUniqueName(error);
    }
  }

  async update(userId: string, id: string, dto: UpdateWalletDto): Promise<WalletView> {
    const wallet = await this.findOwnedOrThrow(userId, id);
    if (dto.categoryId) await this.categories.getSelectableOrThrow(dto.categoryId);

    const changes: Partial<Wallet> = {};
    if (dto.name !== undefined) changes.name = dto.name;
    if (dto.categoryId !== undefined) changes.categoryId = dto.categoryId;
    if (dto.accentColor !== undefined) changes.accentColor = dto.accentColor;
    if (dto.targetAmount !== undefined) changes.targetAmount = dto.targetAmount;

    try {
      await wallet.update(changes);
    } catch (error) {
      throw WalletsService.mapUniqueName(error);
    }
    return WalletsService.toView(await this.findOwnedOrThrow(userId, id));
  }

  async remove(userId: string, id: string): Promise<{ message: string }> {
    const wallet = await this.findOwnedOrThrow(userId, id);
    const balance = wallet.account?.balance ?? 0;
    if (balance > 0) {
      throw AppError.conflict(
        WALLET_ERROR_CODES.WALLET_NOT_EMPTY,
        'Move the money in this wallet back to your salary account before deleting it.',
        { balance },
      );
    }
    await this.ledger.inTransaction(async (t) => {
      await this.rules.destroy({ where: { walletId: id }, transaction: t });
      await wallet.destroy({ transaction: t });
    });
    this.logger.log(`Wallet ${id} deleted by ${userId}`);
    return { message: 'Wallet deleted' };
  }

  async moveToSalary(
    userId: string,
    id: string,
    dto: MoveWalletFundsDto,
  ): Promise<{ message: string; transaction: TransactionView; wallet: WalletView }> {
    const wallet = await this.findOwnedOrThrow(userId, id);
    if (!wallet.account) throw new Error(`Wallet ${id} has no ledger account`);
    const walletAccountId = wallet.account.id;

    try {
      const tx = await this.ledger.inTransaction(async (t) => {
        const salary = await this.ledger.getOrCreateSalaryAccount(userId, t);
        return this.ledger.post(
          {
            userId,
            type: T.WALLET_WITHDRAWAL,
            amount: dto.amount,
            categoryId: wallet.categoryId,
            walletId: wallet.id,
            narration: `Moved from ${wallet.name} to salary account`,
            legs: [
              { accountId: walletAccountId, amount: -dto.amount },
              { accountId: salary.id, amount: dto.amount },
            ],
          },
          t,
        );
      });

      const receipt = await this.transactions.findReceipt(userId, tx.id);
      return {
        message: 'Money moved to your salary account',
        transaction: receipt!,
        wallet: WalletsService.toView(await this.findOwnedOrThrow(userId, id)),
      };
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        throw AppError.unprocessable(
          WALLET_ERROR_CODES.INSUFFICIENT_BALANCE,
          'This wallet does not have enough money for that amount.',
          { available: error.available },
        );
      }
      throw error;
    }
  }

  async listTransactions(
    userId: string,
    id: string,
    query: WalletTransactionsQuery,
  ): Promise<PaginatedResult<TransactionView>> {
    await this.findOwnedOrThrow(userId, id);
    const types =
      query.filter === 'allocated'
        ? [T.WALLET_ALLOCATION]
        : query.filter === 'moved'
          ? [T.WALLET_WITHDRAWAL]
          : undefined;
    return this.transactions.list(
      userId,
      { walletId: id, types, search: query.search },
      { page: query.page ?? 1, limit: query.limit ?? 10 },
      'wallet',
    );
  }

  activity(userId: string, query: WalletActivityQuery): Promise<PaginatedResult<TransactionView>> {
    const direction = query.direction ?? 'all';
    return this.transactions.list(
      userId,
      {
        anyWallet: true,
        types: direction === 'all' ? undefined : typesForDirection(direction, 'wallet'),
        search: query.search,
      },
      { page: query.page ?? 1, limit: query.limit ?? 10 },
      'wallet',
    );
  }

  async findOwnedOrThrow(userId: string, id: string): Promise<Wallet> {
    const wallet = await this.wallets.findOne({
      where: { id, userId },
      include: [Category, LedgerAccount],
    });
    if (!wallet) {
      throw AppError.notFound(WALLET_ERROR_CODES.WALLET_NOT_FOUND, 'Wallet not found.');
    }
    return wallet;
  }

  static toView(wallet: Wallet): WalletView {
    const balance = wallet.account?.balance ?? 0;
    const target = wallet.targetAmount;
    return {
      id: wallet.id,
      name: wallet.name,
      category: toCategoryView(wallet.category),
      accentColor: wallet.accentColor,
      accentHex: WALLET_ACCENT_COLORS[wallet.accentColor] ?? WALLET_ACCENT_COLORS.blue,
      targetAmount: target,
      balance,
      progressPercent: target ? Math.min(100, Math.floor((balance / target) * 100)) : null,
      currency: wallet.currency,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    };
  }

  private static mapUniqueName(error: unknown): unknown {
    if (error instanceof UniqueConstraintError) {
      return AppError.conflict(
        WALLET_ERROR_CODES.WALLET_NAME_TAKEN,
        'You already have a wallet with this name.',
      );
    }
    return error;
  }
}

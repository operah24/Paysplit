import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../decorators/admin-only.decorator';
import { AdminUsersService, ADMIN_ERROR_CODES } from '../services/admin-users.service';
import { AdminListUsersQuery } from '../dtos/admin.dtos';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../users/entities/user.entity';
import { WalletsService } from '../../wallets/services/wallets.service';
import { WalletActivityQuery } from '../../wallets/dtos/wallet.dtos';
import { BeneficiariesService } from '../../beneficiaries/services/beneficiaries.service';
import { ListBeneficiariesQuery } from '../../beneficiaries/dtos/beneficiary.dtos';
import { SplitRulesService } from '../../split-rules/services/split-rules.service';
import { ListSplitRulesQuery } from '../../split-rules/dtos/split-rule.dtos';
import { TransactionsService } from '../../transactions/services/transactions.service';
import { ListTransactionsQuery } from '../../transactions/dtos/transaction.dtos';
import { TransactionQueryService } from '../../ledger/services/transaction-query.service';
import { AppError } from '../../../shared/utils/app-error.util';
import { ReqMeta } from '../../../shared/decorators/request-meta.decorator';
import type { RequestMeta } from '../../../shared/decorators/request-meta.decorator';

@ApiTags('admin')
@AdminOnly()
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly wallets: WalletsService,
    private readonly beneficiaries: BeneficiariesService,
    private readonly splitRules: SplitRulesService,
    private readonly transactions: TransactionsService,
    private readonly transactionQuery: TransactionQueryService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Users list (Manage Users, Recent Users, header search)',
    description:
      'Each row carries KYC summary, salary account, salary paid, payday and `payIn` ' +
      'eligibility for test salary pay-ins.',
  })
  list(@Query() query: AdminListUsersQuery) {
    return this.users.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'User detail header and stat cards (audited)' })
  @ApiResponse({ status: 404, description: 'code ADMIN_USER_NOT_FOUND' })
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: User,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.users.get(id, admin, meta);
  }

  @Get(':id/verification')
  @ApiOperation({
    summary: 'Profile & Verification tab: account details, masked ID, KYC checklist (audited)',
  })
  verification(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: User,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.users.verification(id, admin, meta);
  }

  @Get(':id/transactions')
  @ApiOperation({ summary: 'Transactions tab ("Financial Activity"): All / Wallet / Beneficiary' })
  async transactionsList(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListTransactionsQuery,
  ) {
    await this.users.findCustomerOrThrow(id);
    const { page, limit, ...filters } = query;
    return this.transactions.list(id, filters, { page: page ?? 1, limit: limit ?? 10 });
  }

  @Get(':id/transactions/:reference')
  @ApiOperation({ summary: 'One transaction with its receipt and provider reference' })
  @ApiResponse({ status: 404, description: 'code TRANSACTION_NOT_FOUND' })
  async transactionDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('reference') reference: string,
  ) {
    await this.users.findCustomerOrThrow(id);
    const receipt = await this.transactionQuery.findReceiptByReference(id, reference);
    if (!receipt) {
      throw AppError.notFound(ADMIN_ERROR_CODES.TRANSACTION_NOT_FOUND, 'Transaction not found.');
    }
    return receipt;
  }

  @Get(':id/split-rules')
  @ApiOperation({ summary: 'Split tab: All / Active / Paused, with allocated this month' })
  async splitRulesList(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListSplitRulesQuery,
  ) {
    await this.users.findCustomerOrThrow(id);
    return this.splitRules.list(id, query);
  }

  @Get(':id/wallets')
  @ApiOperation({ summary: 'Wallets tab: balance, target and progress per wallet' })
  async walletsList(@Param('id', ParseUUIDPipe) id: string) {
    await this.users.findCustomerOrThrow(id);
    return this.wallets.list(id);
  }

  @Get(':id/wallets/activity')
  @ApiOperation({ summary: '"All Wallet Activity": Money in / Money out across all wallets' })
  async walletActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: WalletActivityQuery,
  ) {
    await this.users.findCustomerOrThrow(id);
    return this.wallets.activity(id, query);
  }

  @Get(':id/beneficiaries')
  @ApiOperation({ summary: 'Beneficiary tab: All / Active / Paused, account numbers masked' })
  async beneficiariesList(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListBeneficiariesQuery,
  ) {
    await this.users.findCustomerOrThrow(id);
    return this.beneficiaries.list(id, query);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { THROTTLE_LIMITS } from '../../../shared/constants/throttle.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { KycApprovedGuard } from '../../kyc/guards/kyc-approved.guard';
import { User } from '../../users/entities/user.entity';
import { BeneficiariesService } from '../services/beneficiaries.service';
import { BankLookupService } from '../services/bank-lookup.service';
import {
  BeneficiaryTransactionsQuery,
  CreateBeneficiaryDto,
  ListBeneficiariesQuery,
  ResolveAccountDto,
  UpdateBeneficiaryDto,
} from '../dtos/beneficiary.dtos';

@ApiTags('beneficiaries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class BeneficiariesController {
  constructor(
    private readonly beneficiariesService: BeneficiariesService,
    private readonly bankLookup: BankLookupService,
  ) {}

  @Get('banks')
  @Throttle({ default: THROTTLE_LIMITS.LOOKUP })
  @ApiOperation({ summary: 'Nigerian banks for the "Bank Name" dropdown (cached 24h)' })
  @ApiResponse({ status: 200, description: '`[{ code, name }]` sorted by name' })
  @ApiResponse({ status: 503, description: 'code BANK_LOOKUP_UNAVAILABLE' })
  banks() {
    return this.bankLookup.listBanks();
  }

  @Post('beneficiaries/resolve')
  @UseGuards(KycApprovedGuard)
  @Throttle({ default: THROTTLE_LIMITS.BANK_RESOLVE })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Look up the account name ("Ali Dabbs ✓")',
    description: 'Call when the 10th digit is entered. Results are cached for 30 minutes.',
  })
  @ApiResponse({ status: 200, description: '`{ bankCode, bankName, accountNumber, accountName }`' })
  @ApiResponse({ status: 422, description: 'code ACCOUNT_NOT_FOUND or UNKNOWN_BANK' })
  @ApiResponse({ status: 503, description: 'code BANK_LOOKUP_UNAVAILABLE' })
  resolve(@Body() dto: ResolveAccountDto) {
    return this.bankLookup.resolve(dto.bankCode, dto.accountNumber);
  }

  @Get('beneficiaries')
  @ApiOperation({ summary: 'List beneficiaries (All / Active / Paused, search)' })
  list(@CurrentUser() user: User, @Query() query: ListBeneficiariesQuery) {
    return this.beneficiariesService.list(user.id, query);
  }

  @Post('beneficiaries')
  @UseGuards(KycApprovedGuard)
  @Throttle({ default: THROTTLE_LIMITS.BANK_RESOLVE })
  @ApiOperation({
    summary: 'Add a beneficiary (setup step 3 / "Add Recipient/Beneficiary")',
    description: 'The account name is resolved server-side; the client does not send it.',
  })
  @ApiResponse({ status: 201, description: 'The beneficiary' })
  @ApiResponse({ status: 409, description: 'code BENEFICIARY_EXISTS' })
  @ApiResponse({
    status: 422,
    description: 'code ACCOUNT_NOT_FOUND / UNKNOWN_BANK / INVALID_CATEGORY',
  })
  create(@CurrentUser() user: User, @Body() dto: CreateBeneficiaryDto) {
    return this.beneficiariesService.create(user.id, dto);
  }

  @Get('beneficiaries/:id')
  @ApiOperation({ summary: 'Beneficiary detail: account, total allocated, linked rule' })
  get(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.beneficiariesService.get(user.id, id);
  }

  @Patch('beneficiaries/:id')
  @ApiOperation({ summary: 'Edit category / narration, or pause / resume' })
  update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBeneficiaryDto,
  ) {
    return this.beneficiariesService.update(user.id, id, dto);
  }

  @Delete('beneficiaries/:id')
  @ApiOperation({ summary: 'Delete a beneficiary (its split rule is deleted too)' })
  remove(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.beneficiariesService.remove(user.id, id);
  }

  @Get('beneficiaries/:id/transactions')
  @ApiOperation({ summary: 'Transfer history for a beneficiary' })
  transactions(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: BeneficiaryTransactionsQuery,
  ) {
    return this.beneficiariesService.listTransactions(user.id, id, query);
  }
}

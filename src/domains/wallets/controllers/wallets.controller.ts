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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { KycApprovedGuard } from '../../kyc/guards/kyc-approved.guard';
import { User } from '../../users/entities/user.entity';
import { WalletsService } from '../services/wallets.service';
import { WALLET_ACCENT_COLORS } from '../constants/wallet.constants';
import {
  CreateWalletDto,
  MoveWalletFundsDto,
  UpdateWalletDto,
  WalletActivityQuery,
  WalletTransactionsQuery,
} from '../dtos/wallet.dtos';

@ApiTags('wallets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get()
  @ApiOperation({ summary: 'List wallets with balance, target and goal progress' })
  list(@CurrentUser() user: User) {
    return this.walletsService.list(user.id);
  }

  @Get('accent-colors')
  @ApiOperation({ summary: 'Accent colour options for the wallet form' })
  accentColors() {
    return Object.entries(WALLET_ACCENT_COLORS).map(([key, hex]) => ({ key, hex }));
  }

  @Get('activity')
  @ApiOperation({ summary: '"All Wallet Activity" across every wallet (Money in / Money out)' })
  activity(@CurrentUser() user: User, @Query() query: WalletActivityQuery) {
    return this.walletsService.activity(user.id, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a wallet (setup step 2 / "Create New Wallet")' })
  @ApiResponse({ status: 201, description: 'The wallet' })
  @ApiResponse({ status: 409, description: 'code WALLET_NAME_TAKEN' })
  @ApiResponse({ status: 422, description: 'code INVALID_CATEGORY' })
  create(@CurrentUser() user: User, @Body() dto: CreateWalletDto) {
    return this.walletsService.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Wallet detail: available balance, total allocated, total moved back, linked rule',
  })
  get(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.walletsService.get(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit wallet' })
  update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWalletDto,
  ) {
    return this.walletsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an empty wallet (its split rule is deleted too)' })
  @ApiResponse({ status: 409, description: 'code WALLET_NOT_EMPTY' })
  remove(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.walletsService.remove(user.id, id);
  }

  @Get(':id/transactions')
  @ApiOperation({ summary: 'Wallet transaction history (All / Allocated / Moved)' })
  transactions(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: WalletTransactionsQuery,
  ) {
    return this.walletsService.listTransactions(user.id, id, query);
  }

  @Post(':id/move')
  @UseGuards(KycApprovedGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '"Move" money from the wallet back to the salary account' })
  @ApiResponse({ status: 422, description: 'code INSUFFICIENT_BALANCE' })
  move(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveWalletFundsDto,
  ) {
    return this.walletsService.moveToSalary(user.id, id, dto);
  }
}

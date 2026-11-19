import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { THROTTLE_LIMITS } from '../../../shared/constants/throttle.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../users/entities/user.entity';
import { TransactionsService } from '../services/transactions.service';
import { ListTransactionsQuery, TransactionFilterQuery } from '../dtos/transaction.dtos';
import { lagosToday } from '../../../shared/utils/payday.util';

@ApiTags('transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @ApiOperation({
    summary: 'Transaction & splits history (All / Wallet / Beneficiary, search, dates)',
    description:
      'Also powers "Recent Activity & Splits" on the dashboard (`limit=5`). `signedAmount` is negative for money leaving the salary account.',
  })
  list(@CurrentUser() user: User, @Query() query: ListTransactionsQuery) {
    const { page, limit, ...filters } = query;
    return this.transactionsService.list(user.id, filters, { page: page ?? 1, limit: limit ?? 10 });
  }

  @Get('export')
  @Throttle({ default: THROTTLE_LIMITS.EXPORT })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiProduces('text/csv')
  @ApiOperation({
    summary: '"Export Statement CSV" (same filters as the list, up to 5,000 rows)',
  })
  async export(
    @CurrentUser() user: User,
    @Query() filters: TransactionFilterQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csv = await this.transactionsService.exportCsv(user.id, filters);
    const { year, monthIndex, day } = lagosToday();
    const stamp = `${year}${String(monthIndex + 1).padStart(2, '0')}${String(day).padStart(2, '0')}`;
    res.setHeader('Content-Disposition', `attachment; filename="paysplit-statement-${stamp}.csv"`);
    return new StreamableFile(Buffer.from(csv, 'utf8'));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Transaction details / receipt' })
  receipt(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.transactionsService.receipt(user.id, id);
  }
}

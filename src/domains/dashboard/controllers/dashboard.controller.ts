import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../users/entities/user.entity';
import { DashboardService } from '../services/dashboard.service';

class CashFlowQuery {
  @ApiPropertyOptional({ description: 'YYYY-MM-DD (Lagos). Default: first day 8 months ago' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD inclusive (Lagos). Default: today' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Balance, split allocation, wallets total, next split run, partition, onboarding',
  })
  summary(@CurrentUser() user: User) {
    return this.dashboardService.summary(user);
  }

  @Get('cash-flow')
  @ApiOperation({
    summary: '"Salary Allocation & Split Cash Flow" chart',
    description: 'Monthly buckets by default (last 9 months); daily for ranges up to 62 days.',
  })
  cashFlow(@CurrentUser() user: User, @Query() query: CashFlowQuery) {
    return this.dashboardService.cashFlow(user.id, query.from, query.to);
  }
}

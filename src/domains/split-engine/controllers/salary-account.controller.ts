import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { KycApprovedGuard } from '../../kyc/guards/kyc-approved.guard';
import { User } from '../../users/entities/user.entity';
import { THROTTLE_LIMITS } from '../../../shared/constants/throttle.constants';
import { SalaryAccountService } from '../../salary-account/services/salary-account.service';
import { CreditService } from '../services/credit.service';
import { SimulateCreditDto } from '../dtos/split-engine.dtos';

@ApiTags('salary-account')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('salary-account')
export class SalaryAccountController {
  constructor(
    private readonly salaryAccounts: SalaryAccountService,
    private readonly credits: CreditService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '"Account details": status, balance and the funding account number(s)',
    description:
      'status: not_issued (before KYC approval), pending (being created at HePaid), active, ' +
      'failed, closed. Account numbers are null until active.',
  })
  get(@CurrentUser() user: User) {
    return this.salaryAccounts.getView(user);
  }

  @Post('simulate-credit')
  @UseGuards(KycApprovedGuard)
  @Throttle({ default: THROTTLE_LIMITS.SIMULATE_CREDIT })
  @ApiOperation({
    summary: 'Dev/QA only: fake a salary credit (PAYMENTS_SIMULATION=true)',
    description:
      'Goes through the real credit flow: notification, then an automatic split when the ' +
      'amount is at least half the expected salary. Beneficiary payouts settle without HePaid.',
  })
  @ApiResponse({ status: 403, description: 'code SIMULATION_DISABLED or KYC_REQUIRED' })
  simulateCredit(@CurrentUser() user: User, @Body() dto: SimulateCreditDto) {
    return this.credits.simulate(user, dto);
  }
}

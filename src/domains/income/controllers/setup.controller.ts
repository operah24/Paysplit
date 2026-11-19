import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/services/users.service';
import { IncomeService } from '../services/income.service';
import { UpsertIncomeDto } from '../dtos/upsert-income.dto';
import { SetupEventsService } from '../services/setup-events.service';

@ApiTags('setup')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('setup')
export class SetupController {
  constructor(
    private readonly incomeService: IncomeService,
    private readonly usersService: UsersService,
    private readonly setupEvents: SetupEventsService,
  ) {}

  @Get('income')
  @ApiOperation({ summary: 'Salary income source (null if not set yet)' })
  async getIncome(@CurrentUser() user: User) {
    return { income: await this.incomeService.get(user.id) };
  }

  @Put('income')
  @ApiOperation({
    summary: 'Step 1 — save employer, monthly salary and payday',
    description: 'Also used by Profile & Settings → Salary Income Source.',
  })
  @ApiResponse({ status: 200, description: '`{ income, onboarding }`' })
  async upsertIncome(@CurrentUser() user: User, @Body() dto: UpsertIncomeDto) {
    const income = await this.incomeService.upsert(user.id, dto);
    const onboarding = await this.setupEvents.afterSetupChange(user);
    return { income, onboarding };
  }

  @Get('progress')
  @ApiOperation({
    summary: 'Setup checklist and onboarding progress',
    description:
      '`setupChecklist` drives the 4-step modal; `progress.percent` drives the "Complete your account setup" card.',
  })
  async progress(@CurrentUser() user: User) {
    return { onboarding: await this.usersService.getOnboardingStatus(user) };
  }
}

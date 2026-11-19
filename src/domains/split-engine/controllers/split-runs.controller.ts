import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { KycApprovedGuard } from '../../kyc/guards/kyc-approved.guard';
import { User } from '../../users/entities/user.entity';
import { PaginationDto } from '../../../shared/dtos/pagination.dto';
import { THROTTLE_LIMITS } from '../../../shared/constants/throttle.constants';
import { SplitEngineService } from '../services/split-engine.service';

@ApiTags('split-runs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('split-runs')
export class SplitRunsController {
  constructor(private readonly engine: SplitEngineService) {}

  @Post()
  @UseGuards(KycApprovedGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: THROTTLE_LIMITS.SPLIT_RUN })
  @ApiOperation({
    summary: 'Run Now: split the salary account balance by the active rules',
    description:
      'Rules run by priority (lower first). Percentage rules apply to the current balance. ' +
      'Wallet allocations complete immediately; beneficiary transfers may finish later ' +
      '(status "processing"). Rules that do not fit are listed in "skipped".',
  })
  @ApiResponse({ status: 409, description: 'code SALARY_ACCOUNT_NOT_ACTIVE' })
  @ApiResponse({ status: 422, description: 'code NO_ACTIVE_RULES or NOTHING_TO_SPLIT' })
  runNow(@CurrentUser() user: User) {
    return this.engine.runNow(user);
  }

  @Get()
  @ApiOperation({ summary: 'Split history (automatic and Run Now), newest first' })
  list(@CurrentUser() user: User, @Query() query: PaginationDto) {
    return this.engine.list(user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Split run detail with its transactions and skipped rules' })
  @ApiResponse({ status: 404, description: 'code SPLIT_RUN_NOT_FOUND' })
  get(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.engine.get(user.id, id);
  }
}

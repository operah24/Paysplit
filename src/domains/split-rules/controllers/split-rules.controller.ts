import {
  Body,
  Controller,
  Delete,
  Get,
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
import { SplitRulesService } from '../services/split-rules.service';
import {
  CreateSplitRuleDto,
  ListSplitRulesQuery,
  UpdateSplitRuleDto,
} from '../dtos/split-rule.dtos';

@ApiTags('split-rules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('split-rules')
export class SplitRulesController {
  constructor(private readonly splitRulesService: SplitRulesService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Monthly salary baseline, total allocated, remainder and the allocation bar',
  })
  summary(@CurrentUser() user: User) {
    return this.splitRulesService.summary(user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List rules in priority order (All / Active / Paused, search)' })
  list(@CurrentUser() user: User, @Query() query: ListSplitRulesQuery) {
    return this.splitRulesService.list(user.id, query);
  }

  @Post()
  @UseGuards(KycApprovedGuard)
  @ApiOperation({ summary: 'Create a split rule ("Activate Split Rule" / setup step 4)' })
  @ApiResponse({ status: 201, description: '`{ rule, onboarding }`' })
  @ApiResponse({ status: 409, description: 'code DESTINATION_HAS_RULE' })
  @ApiResponse({
    status: 422,
    description: 'code ALLOCATION_EXCEEDS_SALARY / DESTINATION_NOT_FOUND / INVALID_RULE_VALUE',
  })
  create(@CurrentUser() user: User, @Body() dto: CreateSplitRuleDto) {
    return this.splitRulesService.create(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One rule' })
  get(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.splitRulesService.get(user.id, id);
  }

  @Patch(':id')
  @UseGuards(KycApprovedGuard)
  @ApiOperation({
    summary: 'Edit / reconfigure a rule, or pause / resume it (`status`)',
    description: 'Send `method` and `value` together when changing the allocation.',
  })
  update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSplitRuleDto,
  ) {
    return this.splitRulesService.update(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a rule' })
  remove(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.splitRulesService.remove(user.id, id);
  }
}

import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { THROTTLE_LIMITS } from '../../../shared/constants/throttle.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../users/entities/user.entity';
import { KycApprovedGuard } from '../guards/kyc-approved.guard';
import { NigeriaIdentityDto } from '../dtos/nigeria-identity.dto';
import { KycService } from '../services/kyc.service';

@ApiTags('salary-account')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, KycApprovedGuard)
@Controller('salary-account')
export class SalaryAccountIdentityController {
  constructor(private readonly kycService: KycService) {}

  @Post('identity')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: THROTTLE_LIMITS.KYC_SUBMIT })
  @ApiOperation({
    summary: 'Add a BVN or NIN so the salary account can be issued',
    description:
      'For approved users whose salary account shows actionRequired "add_bvn_or_nin" ' +
      '(after HePaid rejected the account). ' +
      'The ID is checked with Dojah against the verified name (and date of birth for a NIN), ' +
      'then the salary account is retried. Returns the salary account view.',
  })
  @ApiResponse({
    status: 409,
    description:
      'code SALARY_ACCOUNT_IDENTITY_NOT_NEEDED (active or being set up) or ID_ALREADY_USED',
  })
  @ApiResponse({
    status: 422,
    description: 'code IDENTITY_NOT_FOUND, NAME_MISMATCH or DOB_MISMATCH',
  })
  @ApiResponse({ status: 429, description: 'code ATTEMPTS_EXCEEDED' })
  @ApiResponse({ status: 503, description: 'code PROVIDER_UNAVAILABLE' })
  addIdentity(@CurrentUser() user: User, @Body() dto: NigeriaIdentityDto) {
    return this.kycService.addSalaryAccountIdentity(user.id, dto);
  }
}

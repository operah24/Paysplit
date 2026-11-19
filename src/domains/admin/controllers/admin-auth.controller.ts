import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../../auth/services/auth.service';
import { LoginDto } from '../../auth/dtos/login.dto';
import { THROTTLE_LIMITS } from '../../../shared/constants/throttle.constants';
import { ReqMeta } from '../../../shared/decorators/request-meta.decorator';
import type { RequestMeta } from '../../../shared/decorators/request-meta.decorator';

@ApiTags('admin')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ default: THROTTLE_LIMITS.LOGIN })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Admin login',
    description:
      '`rememberMe: true` issues a 30-day token. Customer accounts get 401 "Invalid email or ' +
      'password", the same as a wrong password.',
  })
  @ApiResponse({ status: 200, description: 'accessToken + user' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  login(@Body() dto: LoginDto, @ReqMeta() meta: RequestMeta) {
    return this.authService.adminLogin(dto, meta);
  }
}

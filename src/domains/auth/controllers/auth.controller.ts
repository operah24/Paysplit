import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { THROTTLE_LIMITS } from '../../../shared/constants/throttle.constants';
import { AuthService } from '../services/auth.service';
import type { TokenPayload } from '../services/token.service';
import { SignupDto } from '../dtos/signup.dto';
import { VerifyCodeDto } from '../dtos/verify-code.dto';
import { ResendCodeDto } from '../dtos/resend-code.dto';
import { SetPasswordDto } from '../dtos/set-password.dto';
import { LoginDto } from '../dtos/login.dto';
import { ForgotPasswordDto } from '../dtos/forgot-password.dto';
import { ResetPasswordDto } from '../dtos/reset-password.dto';
import { ChangePasswordDto } from '../dtos/change-password.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { SetupTokenGuard } from '../guards/setup-token.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { SetupToken } from '../decorators/setup-token.decorator';
import { User } from '../../users/entities/user.entity';
import { ReqMeta } from '../../../shared/decorators/request-meta.decorator';
import type { RequestMeta } from '../../../shared/decorators/request-meta.decorator';

@ApiTags('access')
@Controller('access')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('enrollments')
  @Throttle({ default: THROTTLE_LIMITS.SIGNUP })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Step 1 — create an account (first name, last name, email)',
    description:
      'Emails a 6-digit verification code. Next: POST /access/enrollments/email/confirm.',
  })
  @ApiResponse({ status: 201, description: 'Account created, verification code sent' })
  @ApiResponse({ status: 409, description: 'An account with this email already exists' })
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('enrollments/email/confirm')
  @Throttle({ default: THROTTLE_LIMITS.OTP_VERIFY })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Step 2 — verify email with the 6-digit code',
    description:
      'Returns a short-lived setupToken. Next: POST /access/enrollments/credentials with ' +
      '`Authorization: Bearer <setupToken>`. A code is invalidated after 5 wrong attempts.',
  })
  @ApiResponse({ status: 200, description: 'Email verified, setup token returned' })
  @ApiResponse({ status: 401, description: 'Invalid or expired code' })
  verifyEmail(@Body() dto: VerifyCodeDto) {
    return this.authService.verifyEmail(dto);
  }

  @Post('enrollments/email/resend')
  @Throttle({ default: THROTTLE_LIMITS.OTP_SEND })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '"Didn\'t get a code? Click to resend"',
    description:
      'Sends a new code if the cooldown has passed. `resendAvailableInSeconds` drives the countdown.',
  })
  @ApiResponse({ status: 200, description: 'Code resent (or cooldown still running)' })
  resendEmailCode(@Body() dto: ResendCodeDto) {
    return this.authService.resendEmailCode(dto);
  }

  @Post('enrollments/credentials')
  @UseGuards(SetupTokenGuard)
  @Throttle({ default: THROTTLE_LIMITS.SET_PASSWORD })
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Step 3 — create a password (requires the setup token)',
    description:
      'Completes signup. Returns an access token plus `onboarding`, which drives the ' +
      '"Welcome to PaySplit" modal (Continue to KYC / Go to Dashboard).',
  })
  @ApiResponse({ status: 200, description: 'Password set, user logged in' })
  @ApiResponse({ status: 401, description: 'Missing, invalid or expired setup token' })
  @ApiResponse({ status: 409, description: 'Password already set' })
  setPassword(@SetupToken() setupToken: TokenPayload, @Body() dto: SetPasswordDto) {
    return this.authService.setPassword(setupToken.id, dto);
  }

  @Post('sessions')
  @Throttle({ default: THROTTLE_LIMITS.LOGIN })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login with email and password',
    description:
      '`rememberMe: true` issues a 30-day token. If signup was never finished the response ' +
      'is 401 with `code: "ACCOUNT_SETUP_INCOMPLETE"` and a verification code is emailed.',
  })
  @ApiResponse({ status: 200, description: 'Login successful, returns token + user + onboarding' })
  @ApiResponse({ status: 401, description: 'Invalid credentials, or account setup incomplete' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user and onboarding status' })
  @ApiResponse({ status: 200, description: 'The current user with onboarding status' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  me(@CurrentUser() user: User) {
    return this.authService.me(user);
  }

  @Delete('sessions/current')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign out (the "Sign out of Paysplit?" modal)',
    description: 'Revokes every access token issued so far for this user (all devices).',
  })
  @ApiResponse({ status: 200, description: 'Signed out' })
  logout(@CurrentUser() user: User, @ReqMeta() meta: RequestMeta) {
    return this.authService.logout(user, meta);
  }

  @Patch('credentials')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: THROTTLE_LIMITS.RESET_PASSWORD })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change password (Settings → Security)',
    description:
      'Signs out other sessions and returns a fresh access token for the current device.',
  })
  @ApiResponse({ status: 200, description: 'Password changed; new access token returned' })
  @ApiResponse({ status: 401, description: 'code INVALID_CURRENT_PASSWORD' })
  @ApiResponse({ status: 409, description: 'code PASSWORD_UNCHANGED' })
  changePassword(
    @CurrentUser() user: User,
    @Body() dto: ChangePasswordDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.authService.changePassword(user, dto, meta);
  }

  @Post('recovery/request')
  @Throttle({ default: THROTTLE_LIMITS.FORGOT_PASSWORD })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a password reset code' })
  @ApiResponse({ status: 200, description: 'Reset code sent if the email exists' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('recovery/confirm')
  @Throttle({ default: THROTTLE_LIMITS.OTP_VERIFY })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify the password reset code' })
  @ApiResponse({
    status: 200,
    description: 'Code verified; POST /access/recovery/reset is unlocked',
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired code' })
  verifyResetCode(@Body() dto: VerifyCodeDto) {
    return this.authService.verifyResetCode(dto);
  }

  @Post('recovery/reset')
  @Throttle({ default: THROTTLE_LIMITS.RESET_PASSWORD })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a new password after confirming the recovery code' })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiResponse({ status: 401, description: 'Reset code not verified' })
  resetPassword(@Body() dto: ResetPasswordDto, @ReqMeta() meta: RequestMeta) {
    return this.authService.resetPassword(dto, meta);
  }
}

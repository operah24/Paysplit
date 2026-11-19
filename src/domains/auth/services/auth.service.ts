import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';
import { EmailService } from '../../../integration/email/email.service';
import { UsersService, ROLES, isAdminUser } from '../../users/services/users.service';
import { User } from '../../users/entities/user.entity';
import { AdminAuditService } from '../../audit/services/admin-audit.service';
import { ADMIN_AUDIT_ACTIONS, AdminAuditAction } from '../../audit/constants/audit.constants';
import type { RequestMeta } from '../../../shared/decorators/request-meta.decorator';
import type { OnboardingStatus } from '../../users/utils/onboarding-status';
import {
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_MINUTES,
  OTP_TYPES,
  OtpType,
} from '../constants/otp.constants';
import { SignupDto } from '../dtos/signup.dto';
import { LoginDto } from '../dtos/login.dto';
import { VerifyCodeDto } from '../dtos/verify-code.dto';
import { ResendCodeDto } from '../dtos/resend-code.dto';
import { SetPasswordDto } from '../dtos/set-password.dto';
import { ForgotPasswordDto } from '../dtos/forgot-password.dto';
import { ResetPasswordDto } from '../dtos/reset-password.dto';
import { ChangePasswordDto } from '../dtos/change-password.dto';

export const ACCOUNT_SETUP_INCOMPLETE = 'ACCOUNT_SETUP_INCOMPLETE';

export const AUTH_ERROR_CODES = {
  INVALID_CURRENT_PASSWORD: 'INVALID_CURRENT_PASSWORD',
  PASSWORD_UNCHANGED: 'PASSWORD_UNCHANGED',
} as const;

const BCRYPT_ROUNDS = 10;

export interface CodeSentResponse {
  message: string;
  email: string;

  resendAvailableInSeconds: number;
}

export interface VerifyEmailResponse {
  message: string;

  setupToken: string;
  setupTokenExpiresIn: number;
  user: Record<string, unknown>;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: 'Bearer';

  expiresIn: number;
  user: Record<string, unknown>;
  onboarding: OnboardingStatus;
}

export type AdminAuthResponse = Omit<AuthResponse, 'onboarding'>;

export interface CurrentUserResponse {
  user: Record<string, unknown>;
  onboarding: OnboardingStatus;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly otpService: OtpService,
    private readonly tokenService: TokenService,
    private readonly emailService: EmailService,
    private readonly usersService: UsersService,
    private readonly audit: AdminAuditService,
  ) {}

  private static normaliseEmail(email: string): string {
    return email.toLowerCase().trim();
  }

  async signup(dto: SignupDto): Promise<CodeSentResponse> {
    const email = AuthService.normaliseEmail(dto.email);
    const firstName = dto.firstName.trim();
    const lastName = dto.lastName.trim();

    let user = await this.usersService.findByEmail(email);

    if (user?.passwordSetAt) {
      throw new ConflictException('An account with this email already exists. Please log in.');
    }

    if (user) {
      this.assertAccountActive(user);
      await this.usersService.update(user.id, { firstName, lastName });
    } else {
      const role = await this.usersService.findRoleByName(ROLES.USER);
      if (!role) {
        throw new InternalServerErrorException(
          `Default role "${ROLES.USER}" is missing. Run the role seeder.`,
        );
      }
      user = await this.usersService.create({
        email,
        firstName,
        lastName,
        roleId: role.id,
        isEmailVerified: false,
      });
    }

    const resendAvailableInSeconds = await this.sendCodeIfAllowed(
      email,
      OTP_TYPES.REGISTRATION,
      firstName,
    );

    return {
      message: 'Account created. Enter the code we sent to your email.',
      email,
      resendAvailableInSeconds,
    };
  }

  async verifyEmail(dto: VerifyCodeDto): Promise<VerifyEmailResponse> {
    const email = AuthService.normaliseEmail(dto.email);
    const invalid = new UnauthorizedException('Invalid or expired code');

    const user = await this.usersService.findByEmail(email);
    if (!user) throw invalid;
    this.assertAccountActive(user);

    const isValid = await this.otpService.verify(email, OTP_TYPES.REGISTRATION, dto.code, {
      consume: true,
    });
    if (!isValid) throw invalid;

    if (user.passwordSetAt) {
      throw new ConflictException('This account is already set up. Please log in.');
    }

    if (!user.isEmailVerified) {
      await this.usersService.update(user.id, { isEmailVerified: true });
    }

    const setup = this.tokenService.signPasswordSetupToken(user);
    const freshUser = (await this.usersService.findById(user.id)) ?? user;

    return {
      message: 'Email verified. Create a password to finish setting up your account.',
      setupToken: setup.token,
      setupTokenExpiresIn: setup.expiresIn,
      user: freshUser.toJSON(),
    };
  }

  async resendEmailCode(dto: ResendCodeDto): Promise<CodeSentResponse> {
    const email = AuthService.normaliseEmail(dto.email);
    const user = await this.usersService.findByEmail(email);

    let resendAvailableInSeconds = OTP_RESEND_COOLDOWN_SECONDS;
    if (user && !user.passwordSetAt && this.isAccountActive(user)) {
      resendAvailableInSeconds = await this.sendCodeIfAllowed(
        email,
        OTP_TYPES.REGISTRATION,
        user.firstName,
      );
    }

    return {
      message: 'If this email has a pending signup, a new code has been sent.',
      email,
      resendAvailableInSeconds,
    };
  }

  async setPassword(userId: string, dto: SetPasswordDto): Promise<AuthResponse> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('Invalid or expired setup token');
    this.assertAccountActive(user);

    if (!user.isEmailVerified) {
      throw new ForbiddenException('Verify your email before creating a password.');
    }
    if (user.passwordSetAt) {
      throw new ConflictException('A password has already been set. Please log in.');
    }

    const now = new Date();
    await this.usersService.update(user.id, {
      password: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
      passwordSetAt: now,
      lastLoginAt: now,
    });

    this.logger.log(`Signup completed for ${user.email}`);
    const freshUser = (await this.usersService.findById(user.id)) ?? user;
    return this.buildAuthResponse(freshUser, false);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const email = AuthService.normaliseEmail(dto.email);
    const invalid = new UnauthorizedException('Invalid email or password');

    const user = await this.usersService.findByEmail(email);

    if (!user || isAdminUser(user)) throw invalid;

    if (!user.password || !user.passwordSetAt) {
      this.assertAccountActive(user);
      const resendAvailableInSeconds = await this.sendCodeIfAllowed(
        email,
        OTP_TYPES.REGISTRATION,
        user.firstName,
      );
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'Unauthorized',
        code: ACCOUNT_SETUP_INCOMPLETE,
        message:
          'Your account setup is incomplete. Enter the code we sent to your email to finish.',
        resendAvailableInSeconds,
      });
    }

    if (!(await bcrypt.compare(dto.password, user.password))) throw invalid;
    this.assertAccountActive(user);

    await this.usersService.update(user.id, { lastLoginAt: new Date() });
    return this.buildAuthResponse(user, dto.rememberMe ?? false);
  }

  async adminLogin(dto: LoginDto, meta: RequestMeta): Promise<AdminAuthResponse> {
    const email = AuthService.normaliseEmail(dto.email);
    const invalid = new UnauthorizedException('Invalid email or password');

    const user = await this.usersService.findByEmail(email);
    if (!user || !isAdminUser(user)) throw invalid;

    const passwordOk =
      !!user.password &&
      !!user.passwordSetAt &&
      (await bcrypt.compare(dto.password, user.password));
    if (!passwordOk || !this.isAccountActive(user)) {
      await this.audit.record({
        adminId: user.id,
        action: ADMIN_AUDIT_ACTIONS.LOGIN_FAILED,
        metadata: { reason: passwordOk ? 'deactivated' : 'invalid_credentials' },
        meta,
      });
    }
    if (!passwordOk) throw invalid;
    this.assertAccountActive(user);

    const rememberMe = dto.rememberMe ?? false;
    await this.usersService.update(user.id, { lastLoginAt: new Date() });
    await this.audit.record({
      adminId: user.id,
      action: ADMIN_AUDIT_ACTIONS.LOGIN,
      metadata: { rememberMe },
      meta,
    });

    const { token, expiresIn } = this.tokenService.signAccessToken(user, rememberMe);
    return { accessToken: token, tokenType: 'Bearer', expiresIn, user: user.toJSON() };
  }

  async me(user: User): Promise<CurrentUserResponse> {
    return { user: user.toJSON(), onboarding: await this.usersService.getOnboardingStatus(user) };
  }

  async logout(user: User, meta?: RequestMeta): Promise<{ message: string }> {
    await this.usersService.incrementTokenVersion(user.id);
    await this.auditIfAdmin(user, ADMIN_AUDIT_ACTIONS.LOGOUT, meta);
    this.logger.log(`User ${user.id} signed out`);
    return { message: 'You have been signed out.' };
  }

  async changePassword(
    user: User,
    dto: ChangePasswordDto,
    meta?: RequestMeta,
  ): Promise<AuthResponse> {
    const current = await this.usersService.findById(user.id);
    if (!current?.password || !(await bcrypt.compare(dto.currentPassword, current.password))) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'Unauthorized',
        code: AUTH_ERROR_CODES.INVALID_CURRENT_PASSWORD,
        message: 'Your current password is incorrect.',
      });
    }
    if (await bcrypt.compare(dto.newPassword, current.password)) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: AUTH_ERROR_CODES.PASSWORD_UNCHANGED,
        message: 'Choose a password different from your current one.',
      });
    }

    await this.usersService.update(current.id, {
      password: await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS),
      passwordSetAt: new Date(),
    });
    await this.usersService.incrementTokenVersion(current.id);
    await this.auditIfAdmin(current, ADMIN_AUDIT_ACTIONS.PASSWORD_CHANGED, meta);
    this.logger.log(`Password changed for user ${current.id}`);

    const fresh = (await this.usersService.findById(current.id)) ?? current;
    return this.buildAuthResponse(fresh, false);
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const email = AuthService.normaliseEmail(dto.email);
    const user = await this.usersService.findByEmail(email);

    if (user && this.isAccountActive(user)) {
      await this.sendCodeIfAllowed(email, OTP_TYPES.PASSWORD_RESET, user.firstName);
    } else {
      this.logger.warn(`Password reset requested for unknown or inactive email: ${email}`);
    }

    return { message: 'If the email exists, a password reset code has been sent.' };
  }

  async verifyResetCode(dto: VerifyCodeDto): Promise<{ message: string }> {
    const email = AuthService.normaliseEmail(dto.email);
    const isValid = await this.otpService.verify(email, OTP_TYPES.PASSWORD_RESET, dto.code, {
      consume: false,
    });
    if (!isValid) throw new UnauthorizedException('Invalid or expired code');

    return { message: 'Code verified. You may now reset your password.' };
  }

  async resetPassword(dto: ResetPasswordDto, meta?: RequestMeta): Promise<{ message: string }> {
    const email = AuthService.normaliseEmail(dto.email);
    const notVerified = new UnauthorizedException(
      'Password reset requires a verified code. Please complete the verification step first.',
    );

    if (!(await this.otpService.hasVerified(email, OTP_TYPES.PASSWORD_RESET))) throw notVerified;

    const user = await this.usersService.findByEmail(email);
    if (!user) throw notVerified;
    this.assertAccountActive(user);

    await this.usersService.update(user.id, {
      password: await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS),
      passwordSetAt: new Date(),

      isEmailVerified: true,
    });

    await this.usersService.incrementTokenVersion(user.id);
    await this.otpService.consumeVerified(email, OTP_TYPES.PASSWORD_RESET);
    await this.auditIfAdmin(user, ADMIN_AUDIT_ACTIONS.PASSWORD_RESET, meta);

    this.logger.log(`Password reset complete for ${email}`);
    return { message: 'Password has been reset successfully' };
  }

  private async sendCodeIfAllowed(
    email: string,
    type: OtpType,
    firstName: string | null,
  ): Promise<number> {
    const cooldown = await this.otpService.getResendCooldown(email, type);
    if (cooldown > 0) return cooldown;

    const code = await this.otpService.issue(email, type);
    if (type === OTP_TYPES.PASSWORD_RESET) {
      await this.emailService.sendPasswordResetCode(email, code, firstName, OTP_TTL_MINUTES);
    } else {
      await this.emailService.sendEmailVerificationCode(email, code, firstName, OTP_TTL_MINUTES);
    }
    return OTP_RESEND_COOLDOWN_SECONDS;
  }

  private async buildAuthResponse(user: User, rememberMe: boolean): Promise<AuthResponse> {
    const { token, expiresIn } = this.tokenService.signAccessToken(user, rememberMe);
    return {
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn,
      user: user.toJSON(),
      onboarding: await this.usersService.getOnboardingStatus(user),
    };
  }

  private async auditIfAdmin(
    user: User,
    action: AdminAuditAction,
    meta?: RequestMeta,
  ): Promise<void> {
    if (isAdminUser(user)) await this.audit.record({ adminId: user.id, action, meta });
  }

  private isAccountActive(user: User): boolean {
    return user.isActive !== false && !user.deactivatedAt;
  }

  private assertAccountActive(user: User): void {
    if (!this.isAccountActive(user)) {
      throw new ForbiddenException('This account has been deactivated.');
    }
  }
}

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService, ACCOUNT_SETUP_INCOMPLETE, AUTH_ERROR_CODES } from './auth.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';
import { EmailService } from '../../../integration/email/email.service';
import { UsersService } from '../../users/services/users.service';
import { User } from '../../users/entities/user.entity';
import { buildOnboardingStatus } from '../../users/utils/onboarding-status';
import { OTP_RESEND_COOLDOWN_SECONDS, OTP_TYPES } from '../constants/otp.constants';
import { AdminAuditService } from '../../audit/services/admin-audit.service';
import { ADMIN_AUDIT_ACTIONS } from '../../audit/constants/audit.constants';
import type { RequestMeta } from '../../../shared/decorators/request-meta.decorator';

const EMAIL = 'paul@paysplit.com';
const META: RequestMeta = { ip: '203.0.113.7', userAgent: 'jest' };

const makeUser = (overrides: Partial<User> = {}): User => {
  const data = {
    id: 'user-1',
    email: EMAIL,
    firstName: 'Paul',
    lastName: 'Obi',
    isEmailVerified: true,
    passwordSetAt: new Date(),
    password: 'hashed',
    kycStatus: 'not_started',
    isActive: true,
    deactivatedAt: null,
    ...overrides,
  };
  return { ...data, toJSON: () => ({ ...data, password: undefined }) } as unknown as User;
};

describe('AuthService', () => {
  let service: AuthService;
  let users: jest.Mocked<
    Pick<
      UsersService,
      | 'findByEmail'
      | 'findById'
      | 'create'
      | 'update'
      | 'findRoleByName'
      | 'incrementTokenVersion'
      | 'getOnboardingStatus'
    >
  >;
  let otp: jest.Mocked<
    Pick<OtpService, 'issue' | 'verify' | 'getResendCooldown' | 'hasVerified' | 'consumeVerified'>
  >;
  let tokens: jest.Mocked<Pick<TokenService, 'signAccessToken' | 'signPasswordSetupToken'>>;
  let email: jest.Mocked<Pick<EmailService, 'sendEmailVerificationCode' | 'sendPasswordResetCode'>>;
  let audit: jest.Mocked<Pick<AdminAuditService, 'record'>>;

  beforeEach(async () => {
    users = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      findRoleByName: jest.fn().mockResolvedValue({ id: 'role-user' }),
      incrementTokenVersion: jest.fn().mockResolvedValue(undefined),
      getOnboardingStatus: jest.fn((u: User) => Promise.resolve(buildOnboardingStatus(u))),
    };
    otp = {
      issue: jest.fn().mockResolvedValue('184269'),
      verify: jest.fn(),
      getResendCooldown: jest.fn().mockResolvedValue(0),
      hasVerified: jest.fn(),
      consumeVerified: jest.fn(),
    };
    tokens = {
      signAccessToken: jest.fn().mockReturnValue({ token: 'access-token', expiresIn: 86400 }),
      signPasswordSetupToken: jest.fn().mockReturnValue({ token: 'setup-token', expiresIn: 900 }),
    };
    email = {
      sendEmailVerificationCode: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetCode: jest.fn().mockResolvedValue(undefined),
    };

    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: OtpService, useValue: otp },
        { provide: TokenService, useValue: tokens },
        { provide: EmailService, useValue: email },
        { provide: AdminAuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('signup', () => {
    const dto = { firstName: ' Paul ', lastName: 'Obi', email: ' Paul@PaySplit.com ' };

    it('creates the user without a password and emails a verification code', async () => {
      users.findByEmail.mockResolvedValue(null);
      users.create.mockResolvedValue(makeUser({ isEmailVerified: false, passwordSetAt: null }));

      const result = await service.signup(dto);

      expect(users.create).toHaveBeenCalledWith({
        email: EMAIL,
        firstName: 'Paul',
        lastName: 'Obi',
        roleId: 'role-user',
        isEmailVerified: false,
      });
      expect(otp.issue).toHaveBeenCalledWith(EMAIL, OTP_TYPES.REGISTRATION);
      expect(email.sendEmailVerificationCode).toHaveBeenCalledWith(EMAIL, '184269', 'Paul', 10);
      expect(result).toEqual({
        message: expect.any(String) as string,
        email: EMAIL,
        resendAvailableInSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      });
      expect(JSON.stringify(result)).not.toContain('184269');
    });

    it('rejects an email whose account is fully set up', async () => {
      users.findByEmail.mockResolvedValue(makeUser());
      await expect(service.signup(dto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('resumes an unfinished signup instead of creating a duplicate', async () => {
      users.findByEmail.mockResolvedValue(makeUser({ passwordSetAt: null }));
      await service.signup(dto);
      expect(users.create).not.toHaveBeenCalled();
      expect(users.update).toHaveBeenCalledWith('user-1', { firstName: 'Paul', lastName: 'Obi' });
    });

    it('does not send another code during the resend cooldown', async () => {
      users.findByEmail.mockResolvedValue(makeUser({ passwordSetAt: null }));
      otp.getResendCooldown.mockResolvedValue(42);

      const result = await service.signup(dto);

      expect(otp.issue).not.toHaveBeenCalled();
      expect(result.resendAvailableInSeconds).toBe(42);
    });
  });

  describe('verifyEmail', () => {
    it('verifies the email and returns a setup token (not an access token)', async () => {
      const pending = makeUser({ isEmailVerified: false, passwordSetAt: null });
      users.findByEmail.mockResolvedValue(pending);
      users.findById.mockResolvedValue(pending);
      otp.verify.mockResolvedValue(true);

      const result = await service.verifyEmail({ email: EMAIL, code: '184269' });

      expect(otp.verify).toHaveBeenCalledWith(EMAIL, OTP_TYPES.REGISTRATION, '184269', {
        consume: true,
      });
      expect(users.update).toHaveBeenCalledWith('user-1', { isEmailVerified: true });
      expect(result.setupToken).toBe('setup-token');
      expect(result).not.toHaveProperty('accessToken');
    });

    it('rejects a wrong code', async () => {
      users.findByEmail.mockResolvedValue(makeUser({ passwordSetAt: null }));
      otp.verify.mockResolvedValue(false);
      await expect(service.verifyEmail({ email: EMAIL, code: '000000' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an unknown email with the same error', async () => {
      users.findByEmail.mockResolvedValue(null);
      await expect(service.verifyEmail({ email: EMAIL, code: '184269' })).rejects.toThrow(
        'Invalid or expired code',
      );
    });
  });

  describe('resendEmailCode', () => {
    it('resends for a pending signup', async () => {
      users.findByEmail.mockResolvedValue(makeUser({ passwordSetAt: null }));
      await service.resendEmailCode({ email: EMAIL });
      expect(email.sendEmailVerificationCode).toHaveBeenCalled();
    });

    it('answers identically without sending for unknown or completed accounts', async () => {
      users.findByEmail.mockResolvedValue(null);
      const unknown = await service.resendEmailCode({ email: EMAIL });
      users.findByEmail.mockResolvedValue(makeUser());
      const completed = await service.resendEmailCode({ email: EMAIL });

      expect(email.sendEmailVerificationCode).not.toHaveBeenCalled();
      expect(unknown).toEqual(completed);
    });
  });

  describe('setPassword', () => {
    const dto = { password: 'P@ssword123', confirmPassword: 'P@ssword123' };

    it('sets the password and returns an access token with onboarding status', async () => {
      const verified = makeUser({ passwordSetAt: null, password: undefined });
      users.findById.mockResolvedValue(verified);

      const result = await service.setPassword('user-1', dto);

      const update = users.update.mock.calls[0][1];
      expect(await bcrypt.compare('P@ssword123', update.password as string)).toBe(true);
      expect(update.passwordSetAt).toBeInstanceOf(Date);
      expect(result.accessToken).toBe('access-token');
      expect(result.onboarding.nextStep).toBe('kyc');
      expect(tokens.signAccessToken).toHaveBeenCalledWith(expect.anything(), false);
    });

    it('refuses when the email is not verified', async () => {
      users.findById.mockResolvedValue(makeUser({ isEmailVerified: false, passwordSetAt: null }));
      await expect(service.setPassword('user-1', dto)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses to reuse a setup token once the password is set', async () => {
      users.findById.mockResolvedValue(makeUser());
      await expect(service.setPassword('user-1', dto)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    const withPassword = async (overrides: Partial<User> = {}) =>
      makeUser({ password: await bcrypt.hash('P@ssword123', 4), ...overrides });

    it('logs in and records lastLoginAt', async () => {
      users.findByEmail.mockResolvedValue(await withPassword());

      const result = await service.login({ email: EMAIL, password: 'P@ssword123' });

      expect(result.accessToken).toBe('access-token');
      expect(result.onboarding).toBeDefined();
      expect(users.update).toHaveBeenCalledWith('user-1', {
        lastLoginAt: expect.any(Date) as Date,
      });
    });

    it('passes rememberMe through to the token', async () => {
      users.findByEmail.mockResolvedValue(await withPassword());
      await service.login({ email: EMAIL, password: 'P@ssword123', rememberMe: true });
      expect(tokens.signAccessToken).toHaveBeenCalledWith(expect.anything(), true);
    });

    it('rejects a wrong password', async () => {
      users.findByEmail.mockResolvedValue(await withPassword());
      await expect(service.login({ email: EMAIL, password: 'nope' })).rejects.toThrow(
        'Invalid email or password',
      );
    });

    it('flags an unfinished signup and emails a code', async () => {
      users.findByEmail.mockResolvedValue(makeUser({ password: undefined, passwordSetAt: null }));

      const error = await service
        .login({ email: EMAIL, password: 'P@ssword123' })
        .catch((e: UnauthorizedException) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toMatchObject({
        code: ACCOUNT_SETUP_INCOMPLETE,
      });
      expect(email.sendEmailVerificationCode).toHaveBeenCalled();
    });

    it('rejects a deactivated account', async () => {
      users.findByEmail.mockResolvedValue(await withPassword({ isActive: false }));
      await expect(service.login({ email: EMAIL, password: 'P@ssword123' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('password reset', () => {
    it('sends a reset code without revealing whether the account exists', async () => {
      users.findByEmail.mockResolvedValue(makeUser());
      const known = await service.forgotPassword({ email: EMAIL });
      users.findByEmail.mockResolvedValue(null);
      const unknown = await service.forgotPassword({ email: 'nobody@paysplit.com' });

      expect(email.sendPasswordResetCode).toHaveBeenCalledTimes(1);
      expect(known).toEqual(unknown);
    });

    it('verifies a reset code without consuming it', async () => {
      otp.verify.mockResolvedValue(true);
      await service.verifyResetCode({ email: EMAIL, code: '184269' });
      expect(otp.verify).toHaveBeenCalledWith(EMAIL, OTP_TYPES.PASSWORD_RESET, '184269', {
        consume: false,
      });
    });

    it('requires a verified reset code', async () => {
      otp.hasVerified.mockResolvedValue(false);
      await expect(
        service.resetPassword({ email: EMAIL, newPassword: 'N3w@Password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(users.update).not.toHaveBeenCalled();
    });

    it('resets the password and consumes the code', async () => {
      otp.hasVerified.mockResolvedValue(true);
      users.findByEmail.mockResolvedValue(makeUser());

      await service.resetPassword({ email: EMAIL, newPassword: 'N3w@Password' });

      expect(users.update).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ passwordSetAt: expect.any(Date) as Date }),
      );
      expect(otp.consumeVerified).toHaveBeenCalledWith(EMAIL, OTP_TYPES.PASSWORD_RESET);
    });
  });

  describe('logout', () => {
    it('revokes every token by bumping the token version', async () => {
      const result = await service.logout(makeUser());
      expect(users.incrementTokenVersion).toHaveBeenCalledWith('user-1');
      expect(result.message).toMatch(/signed out/i);
    });
  });

  describe('changePassword', () => {
    const dto = {
      currentPassword: 'OldP@ssword1',
      newPassword: 'NewP@ssword2',
      confirmPassword: 'NewP@ssword2',
    };

    it('changes the password, signs out other sessions and returns a new token', async () => {
      const current = makeUser({ password: await bcrypt.hash('OldP@ssword1', 4) });
      users.findById.mockResolvedValue(current);

      const result = await service.changePassword(current, dto);

      const update = users.update.mock.calls[0][1];
      expect(await bcrypt.compare('NewP@ssword2', update.password as string)).toBe(true);
      expect(update.passwordSetAt).toBeInstanceOf(Date);
      expect(users.incrementTokenVersion).toHaveBeenCalledWith('user-1');
      expect(result.accessToken).toBe('access-token');
    });

    it('rejects a wrong current password', async () => {
      const current = makeUser({ password: await bcrypt.hash('OldP@ssword1', 4) });
      users.findById.mockResolvedValue(current);

      await expect(
        service.changePassword(current, { ...dto, currentPassword: 'Wrong1!' }),
      ).rejects.toMatchObject({
        response: { code: AUTH_ERROR_CODES.INVALID_CURRENT_PASSWORD },
      });
      expect(users.update).not.toHaveBeenCalled();
      expect(users.incrementTokenVersion).not.toHaveBeenCalled();
    });

    it('rejects reusing the current password', async () => {
      const current = makeUser({ password: await bcrypt.hash('OldP@ssword1', 4) });
      users.findById.mockResolvedValue(current);

      await expect(
        service.changePassword(current, {
          ...dto,
          newPassword: 'OldP@ssword1',
          confirmPassword: 'OldP@ssword1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('admin accounts', () => {
    const PASSWORD = 'Adm1n@Password';
    const makeAdmin = async (overrides: Partial<User> = {}) =>
      makeUser({
        id: 'admin-1',
        password: await bcrypt.hash(PASSWORD, 4),
        role: { name: 'super_admin' } as User['role'],
        ...overrides,
      });

    it('keeps admins out of the customer login with the generic error', async () => {
      users.findByEmail.mockResolvedValue(await makeAdmin());
      await expect(service.login({ email: EMAIL, password: PASSWORD })).rejects.toThrow(
        'Invalid email or password',
      );
      expect(tokens.signAccessToken).not.toHaveBeenCalled();
    });

    it('signs an admin in, without onboarding, and audits it', async () => {
      users.findByEmail.mockResolvedValue(await makeAdmin());

      const result = await service.adminLogin(
        { email: EMAIL, password: PASSWORD, rememberMe: true },
        META,
      );

      expect(result.accessToken).toBe('access-token');
      expect(result).not.toHaveProperty('onboarding');
      expect(tokens.signAccessToken).toHaveBeenCalledWith(expect.anything(), true);
      expect(audit.record).toHaveBeenCalledWith({
        adminId: 'admin-1',
        action: ADMIN_AUDIT_ACTIONS.LOGIN,
        metadata: { rememberMe: true },
        meta: META,
      });
    });

    it('rejects customer accounts at the admin login with the generic error', async () => {
      users.findByEmail.mockResolvedValue(
        makeUser({
          password: await bcrypt.hash(PASSWORD, 4),
          role: { name: 'user' } as User['role'],
        }),
      );
      await expect(service.adminLogin({ email: EMAIL, password: PASSWORD }, META)).rejects.toThrow(
        'Invalid email or password',
      );
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('audits a wrong admin password', async () => {
      users.findByEmail.mockResolvedValue(await makeAdmin());
      await expect(service.adminLogin({ email: EMAIL, password: 'nope' }, META)).rejects.toThrow(
        'Invalid email or password',
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: ADMIN_AUDIT_ACTIONS.LOGIN_FAILED,
          metadata: { reason: 'invalid_credentials' },
        }),
      );
      expect(tokens.signAccessToken).not.toHaveBeenCalled();
    });

    it('audits and refuses a deactivated admin', async () => {
      users.findByEmail.mockResolvedValue(await makeAdmin({ isActive: false }));
      await expect(
        service.adminLogin({ email: EMAIL, password: PASSWORD }, META),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { reason: 'deactivated' } }),
      );
    });

    it('audits admin logout and password change, but not customer ones', async () => {
      await service.logout(makeUser(), META);
      expect(audit.record).not.toHaveBeenCalled();

      const admin = await makeAdmin();
      await service.logout(admin, META);
      expect(audit.record).toHaveBeenLastCalledWith({
        adminId: 'admin-1',
        action: ADMIN_AUDIT_ACTIONS.LOGOUT,
        meta: META,
      });

      users.findById.mockResolvedValue(admin);
      await service.changePassword(
        admin,
        { currentPassword: PASSWORD, newPassword: 'N3w@Password', confirmPassword: 'N3w@Password' },
        META,
      );
      expect(audit.record).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: ADMIN_AUDIT_ACTIONS.PASSWORD_CHANGED }),
      );
    });

    it('audits an admin password reset', async () => {
      otp.hasVerified.mockResolvedValue(true);
      users.findByEmail.mockResolvedValue(await makeAdmin());
      await service.resetPassword({ email: EMAIL, newPassword: 'N3w@Password' }, META);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ adminId: 'admin-1', action: ADMIN_AUDIT_ACTIONS.PASSWORD_RESET }),
      );
    });
  });
});

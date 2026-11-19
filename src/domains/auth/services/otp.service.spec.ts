import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OtpService } from './otp.service';
import { OtpRepository } from '../repository/otp.repository';
import { Otp } from '../entities/otp.entity';
import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TYPES,
} from '../constants/otp.constants';

const EMAIL = 'paul@paysplit.com';
const TYPE = OTP_TYPES.REGISTRATION;

describe('OtpService', () => {
  let service: OtpService;
  let repo: jest.Mocked<
    Pick<
      OtpRepository,
      | 'deleteByEmailAndType'
      | 'create'
      | 'findLatest'
      | 'findVerified'
      | 'incrementAttempts'
      | 'markAsVerified'
      | 'deleteById'
    >
  >;

  beforeEach(async () => {
    repo = {
      deleteByEmailAndType: jest.fn(),
      create: jest.fn(),
      findLatest: jest.fn(),
      findVerified: jest.fn(),
      incrementAttempts: jest.fn(),
      markAsVerified: jest.fn(),
      deleteById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: OtpRepository, useValue: repo },
        { provide: ConfigService, useValue: { getOrThrow: () => 'hmac-test-key' } },
      ],
    }).compile();

    service = module.get(OtpService);
  });

  const issueAndCapture = async (overrides: Partial<Otp> = {}) => {
    const code = await service.issue(EMAIL, TYPE);
    const created = repo.create.mock.calls[0][0];
    const record = {
      id: 'otp-1',
      ...created,
      attempts: 0,
      isVerified: false,
      createdAt: new Date(),
      ...overrides,
    } as unknown as Otp;
    repo.findLatest.mockResolvedValue(record);
    return { code, record };
  };

  describe('issue', () => {
    it('replaces previous codes and stores only a hash of a 6-digit code', async () => {
      const code = await service.issue(EMAIL, TYPE);
      const stored = repo.create.mock.calls[0][0];

      expect(repo.deleteByEmailAndType).toHaveBeenCalledWith(EMAIL, TYPE);
      expect(code).toMatch(/^\d{6}$/);
      expect(stored.codeHash).toMatch(/^[a-f0-9]{64}$/);
      expect(stored.codeHash).not.toContain(code);
      expect(stored.otpExpiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('verify', () => {
    it('accepts the right code and consumes it', async () => {
      const { code } = await issueAndCapture();
      await expect(service.verify(EMAIL, TYPE, code, { consume: true })).resolves.toBe(true);
      expect(repo.deleteById).toHaveBeenCalledWith('otp-1');
    });

    it('marks the code verified instead of deleting it when consume is false', async () => {
      const { code } = await issueAndCapture();
      await expect(service.verify(EMAIL, TYPE, code, { consume: false })).resolves.toBe(true);
      expect(repo.markAsVerified).toHaveBeenCalledWith('otp-1');
      expect(repo.deleteById).not.toHaveBeenCalled();
    });

    it('counts a wrong guess', async () => {
      const { code } = await issueAndCapture();
      const wrong = code === '000000' ? '111111' : '000000';
      await expect(service.verify(EMAIL, TYPE, wrong, { consume: true })).resolves.toBe(false);
      expect(repo.incrementAttempts).toHaveBeenCalledWith('otp-1');
    });

    it('destroys the code on the final allowed wrong guess', async () => {
      const { code } = await issueAndCapture({ attempts: OTP_MAX_ATTEMPTS - 1 });
      const wrong = code === '000000' ? '111111' : '000000';
      await expect(service.verify(EMAIL, TYPE, wrong, { consume: true })).resolves.toBe(false);
      expect(repo.deleteById).toHaveBeenCalledWith('otp-1');
    });

    it('rejects even the right code once attempts are exhausted', async () => {
      const { code } = await issueAndCapture({ attempts: OTP_MAX_ATTEMPTS });
      await expect(service.verify(EMAIL, TYPE, code, { consume: true })).resolves.toBe(false);
    });

    it('rejects an expired code', async () => {
      const { code } = await issueAndCapture({ otpExpiresAt: new Date(Date.now() - 1000) });
      await expect(service.verify(EMAIL, TYPE, code, { consume: true })).resolves.toBe(false);
    });

    it('rejects when no code exists', async () => {
      repo.findLatest.mockResolvedValue(null);
      await expect(service.verify(EMAIL, TYPE, '123456', { consume: true })).resolves.toBe(false);
    });
  });

  describe('getResendCooldown', () => {
    it('is 0 when no code was sent', async () => {
      repo.findLatest.mockResolvedValue(null);
      await expect(service.getResendCooldown(EMAIL, TYPE)).resolves.toBe(0);
    });

    it('counts down from the cooldown after a send', async () => {
      repo.findLatest.mockResolvedValue({
        createdAt: new Date(Date.now() - 20_000),
      } as unknown as Otp);
      const remaining = await service.getResendCooldown(EMAIL, TYPE);
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(OTP_RESEND_COOLDOWN_SECONDS - 19);
    });

    it('is 0 once the cooldown has passed', async () => {
      repo.findLatest.mockResolvedValue({
        createdAt: new Date(Date.now() - (OTP_RESEND_COOLDOWN_SECONDS + 1) * 1000),
      } as unknown as Otp);
      await expect(service.getResendCooldown(EMAIL, TYPE)).resolves.toBe(0);
    });
  });

  describe('hasVerified', () => {
    it('ignores a verified code that has expired', async () => {
      repo.findVerified.mockResolvedValue({
        otpExpiresAt: new Date(Date.now() - 1000),
      } as unknown as Otp);
      await expect(service.hasVerified(EMAIL, OTP_TYPES.PASSWORD_RESET)).resolves.toBe(false);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { KycService } from './kyc.service';
import { KycCryptoService } from './kyc-crypto.service';
import { UsersService } from '../../users/services/users.service';
import { User } from '../../users/entities/user.entity';
import { KycVerification } from '../entities/kyc-verification.entity';
import { KycAttempt } from '../entities/kyc-attempt.entity';
import { KycVerificationRepository } from '../repository/kyc-verification.repository';
import { KycAttemptRepository } from '../repository/kyc-attempt.repository';
import { DojahService } from '../../../integration/dojah/dojah.service';
import { DojahError } from '../../../integration/dojah/dojah.error';
import { EmailService } from '../../../integration/email/email.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { SalaryAccountProvisioningService } from '../../salary-account/services/salary-account-provisioning.service';
import { SalaryAccountService } from '../../salary-account/services/salary-account.service';
import { buildOnboardingStatus } from '../../users/utils/onboarding-status';

const config: Record<string, unknown> = {
  'kyc.encryptionKey': randomBytes(32).toString('base64'),
  'dojah.faceMatchThreshold': 90,
  'dojah.livenessThreshold': 80,
  'dojah.nameMatchThreshold': 80,
  'kyc.maxIdentityAttemptsPerDay': 3,
  'kyc.maxLivenessAttemptsPerDay': 5,
};

async function rejection(
  promise: Promise<unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const error = await promise.then(
    () => {
      throw new Error('expected rejection');
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(HttpException);
  const http = error as HttpException;
  return { status: http.getStatus(), body: http.getResponse() as Record<string, unknown> };
}

describe('KycService', () => {
  let service: KycService;
  let crypto: KycCryptoService;
  let user: Record<string, unknown>;
  let verification: Record<string, unknown>;
  let attemptRows: Partial<KycAttempt>[];
  let otherUserWithId: KycVerification | null;

  let dojah: jest.Mocked<
    Pick<
      DojahService,
      'validateBvn' | 'lookupNin' | 'verifySelfieWithBvn' | 'verifySelfieWithNin' | 'checkLiveness'
    >
  >;
  let usersUpdate: jest.Mock;
  let verificationsUpdate: jest.Mock;
  let attemptsRecord: jest.Mock;
  let sendKycApproved: jest.Mock;
  let notifyMock: jest.Mock;
  let provisionMock: jest.Mock;
  let retryMock: jest.Mock;
  let salaryAccount: { status: string } | null;

  beforeEach(async () => {
    verification = {
      id: 'kyc-1',
      userId: 'user-1',
      identityStatus: 'not_started',
      livenessStatus: 'not_started',
    };
    user = {
      id: 'user-1',
      email: 'paul@paysplit.com',
      firstName: 'Paul',
      lastName: 'Obi',
      isEmailVerified: true,
      passwordSetAt: new Date(),
      countryCode: 'NG',
      phoneNumber: '+2348034567890',
      kycStatus: 'not_started',
      kycVerification: verification,
    };
    attemptRows = [];
    otherUserWithId = null;

    usersUpdate = jest.fn((_id: string, data: Record<string, unknown>) => {
      Object.assign(user, data);
      return Promise.resolve();
    });
    verificationsUpdate = jest.fn((_id: string, data: Record<string, unknown>) => {
      Object.assign(verification, data);
      return Promise.resolve();
    });
    attemptsRecord = jest.fn((row: Partial<KycAttempt>) => {
      attemptRows.push({ ...row, createdAt: new Date() });
      return Promise.resolve();
    });
    sendKycApproved = jest.fn().mockResolvedValue(undefined);
    notifyMock = jest.fn().mockResolvedValue(undefined);
    provisionMock = jest.fn().mockResolvedValue(null);
    retryMock = jest.fn().mockResolvedValue(null);
    salaryAccount = null;

    dojah = {
      validateBvn: jest
        .fn()
        .mockResolvedValue({ valid: true, firstNameScore: 100, lastNameScore: 95 }),
      lookupNin: jest.fn().mockResolvedValue({
        firstName: 'PAUL',
        middleName: null,
        lastName: 'OBI',
        dateOfBirth: '1990-01-01',
      }),
      verifySelfieWithBvn: jest.fn().mockResolvedValue({
        match: true,
        confidence: 99,
        record: {
          firstName: 'PAUL',
          middleName: null,
          lastName: 'OBI',
          dateOfBirth: '15-Apr-1985',
        },
      }),
      verifySelfieWithNin: jest.fn(),
      checkLiveness: jest.fn().mockResolvedValue({
        isLive: true,
        probability: 98,
        faceDetected: true,
        multipleFaces: false,
      }),
    };

    const configService = {
      get: (key: string, fallback?: unknown) => config[key] ?? fallback,
      getOrThrow: (key: string) => config[key],
    } as unknown as ConfigService;
    crypto = new KycCryptoService(configService);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycService,
        { provide: ConfigService, useValue: configService },
        { provide: KycCryptoService, useValue: crypto },
        { provide: DojahService, useValue: dojah },
        { provide: EmailService, useValue: { sendKycApproved } },
        { provide: NotificationsService, useValue: { notify: notifyMock } },
        {
          provide: SalaryAccountProvisioningService,
          useValue: { provision: provisionMock, retryWithNewIdentity: retryMock },
        },
        {
          provide: SalaryAccountService,
          useValue: {
            findByUserId: jest.fn(() => Promise.resolve(salaryAccount)),
            getView: jest.fn(() => Promise.resolve({ status: 'active', actionRequired: null })),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findById: jest.fn(() => Promise.resolve(user as unknown as User)),
            update: usersUpdate,
            getOnboardingStatus: jest.fn((u: User) => Promise.resolve(buildOnboardingStatus(u))),
          },
        },
        {
          provide: KycVerificationRepository,
          useValue: {
            findOrCreate: jest.fn(() => Promise.resolve(verification)),
            update: verificationsUpdate,
            findOtherUserWithFingerprint: jest.fn(() => Promise.resolve(otherUserWithId)),
          },
        },
        {
          provide: KycAttemptRepository,
          useValue: {
            record: attemptsRecord,
            findCounted: jest.fn((_u: string, step: string) =>
              Promise.resolve(
                attemptRows.filter((r) => r.step === step && r.outcome !== 'provider_error'),
              ),
            ),
          },
        },
      ],
    }).compile();

    service = module.get(KycService);
  });

  describe('updateProfile', () => {
    it('stores the phone in international format and the country currency', async () => {
      user.countryCode = null;
      user.phoneNumber = null;

      const status = await service.updateProfile('user-1', {
        countryCode: 'NG',
        phoneNumber: '803 456 7890',
      });

      expect(usersUpdate).toHaveBeenCalledWith('user-1', {
        countryCode: 'NG',
        phoneNumber: '+2348034567890',
        currencyCode: 'NGN',
      });
      expect(status.currentStep).toBe('identity');
    });

    it('rejects a phone number that is not valid for the country', async () => {
      const { status } = await rejection(
        service.updateProfile('user-1', { countryCode: 'NG', phoneNumber: '12345' }),
      );
      expect(status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('rejects countries that are not supported', async () => {
      const { body } = await rejection(
        service.updateProfile('user-1', { countryCode: 'GH', phoneNumber: '024 123 4567' }),
      );
      expect(body.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('only exposes Nigeria in the country lookup', () => {
      expect(service.getCountries()).toEqual([
        expect.objectContaining({ code: 'NG', name: 'Nigeria', methods: ['bvn', 'nin'] }),
      ]);
    });
  });

  describe('verifyNigeriaIdentity', () => {
    it('passes a valid BVN with matching names and stores it encrypted', async () => {
      const status = await service.verifyNigeriaIdentity('user-1', {
        method: 'bvn',
        idNumber: '22222222222',
      });

      expect(dojah.validateBvn).toHaveBeenCalledWith('22222222222', 'Paul', 'Obi');
      expect(verification.identityStatus).toBe('passed');
      expect(verification.idNumberLast4).toBe('2222');
      expect(verification.idNumberEncrypted).not.toContain('22222222222');
      expect(crypto.decrypt(verification.idNumberEncrypted as string)).toBe('22222222222');
      expect(user.kycStatus).toBe('in_progress');
      expect(status.currentStep).toBe('liveness');
      expect(status.steps.identity.maskedIdNumber).toBe('*******2222');
    });

    it('fails with NAME_MISMATCH when Dojah name scores are low', async () => {
      dojah.validateBvn.mockResolvedValue({ valid: true, firstNameScore: 100, lastNameScore: 40 });

      const { status, body } = await rejection(
        service.verifyNigeriaIdentity('user-1', { method: 'bvn', idNumber: '22222222222' }),
      );

      expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(body).toMatchObject({ code: 'NAME_MISMATCH', attemptsRemaining: 2 });
      expect(verification.identityStatus).toBe('failed');
      expect(user.kycStatus).toBe('action_required');
    });

    it('matches NIN names itself', async () => {
      dojah.lookupNin.mockResolvedValue({
        firstName: 'FATIMA',
        middleName: null,
        lastName: 'BELLO',
        dateOfBirth: null,
      });
      const { body } = await rejection(
        service.verifyNigeriaIdentity('user-1', { method: 'nin', idNumber: '70123456789' }),
      );
      expect(body.code).toBe('NAME_MISMATCH');
    });

    it('maps a Dojah 404 to IDENTITY_NOT_FOUND', async () => {
      dojah.lookupNin.mockRejectedValue(new DojahError(404, 'No record found'));
      const { body } = await rejection(
        service.verifyNigeriaIdentity('user-1', { method: 'nin', idNumber: '70123456789' }),
      );
      expect(body.code).toBe('IDENTITY_NOT_FOUND');
    });

    it('does not burn an attempt when Dojah is down', async () => {
      dojah.validateBvn.mockRejectedValue(new DojahError(503, 'down'));
      const { status } = await rejection(
        service.verifyNigeriaIdentity('user-1', { method: 'bvn', idNumber: '22222222222' }),
      );
      expect(status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(attemptRows[0].outcome).toBe('provider_error');
      expect(verification.identityStatus).toBe('not_started');
    });

    it('rejects an ID already used by another account', async () => {
      otherUserWithId = { userId: 'user-2' } as KycVerification;
      const { status, body } = await rejection(
        service.verifyNigeriaIdentity('user-1', { method: 'bvn', idNumber: '22222222222' }),
      );
      expect(status).toBe(HttpStatus.CONFLICT);
      expect(body.code).toBe('ID_ALREADY_USED');
      expect(dojah.validateBvn).not.toHaveBeenCalled();
    });

    it('enforces the daily attempt limit', async () => {
      dojah.validateBvn.mockResolvedValue({
        valid: false,
        firstNameScore: null,
        lastNameScore: null,
      });
      for (let i = 0; i < 3; i++) {
        await rejection(
          service.verifyNigeriaIdentity('user-1', { method: 'bvn', idNumber: '22222222222' }),
        );
      }
      const { status, body } = await rejection(
        service.verifyNigeriaIdentity('user-1', { method: 'bvn', idNumber: '22222222222' }),
      );
      expect(status).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(body.code).toBe('ATTEMPTS_EXCEEDED');
      expect(dojah.validateBvn).toHaveBeenCalledTimes(3);
    });

    it('requires Profile Basics first', async () => {
      user.phoneNumber = null;
      const { body } = await rejection(
        service.verifyNigeriaIdentity('user-1', { method: 'bvn', idNumber: '22222222222' }),
      );
      expect(body.code).toBe('PROFILE_INCOMPLETE');
    });

    it('never records the ID number in the audit trail', async () => {
      await service.verifyNigeriaIdentity('user-1', { method: 'bvn', idNumber: '22222222222' });
      expect(JSON.stringify(attemptRows)).not.toContain('22222222222');
    });
  });

  describe('verifyLiveness', () => {
    const passIdentity = () =>
      service.verifyNigeriaIdentity('user-1', { method: 'bvn', idNumber: '22222222222' });

    it('requires identity first', async () => {
      const { body } = await rejection(service.verifyLiveness('user-1', 'selfie'));
      expect(body.code).toBe('STEP_OUT_OF_ORDER');
    });

    it('approves after liveness and BVN face match', async () => {
      await passIdentity();

      const result = await service.verifyLiveness('user-1', 'selfie');

      expect(dojah.verifySelfieWithBvn).toHaveBeenCalledWith('22222222222', 'selfie', 90);
      expect(user.kycStatus).toBe('approved');
      expect(verification.livenessStatus).toBe('passed');
      expect(verification.approvedAt).toBeInstanceOf(Date);
      expect(verification.legalFirstName).toBe('PAUL');
      expect(result.message).toBe('Identity approved');
      expect(result.detail).toContain('BVN');
      expect(result.currentStep).toBe('completed');
      expect(sendKycApproved).toHaveBeenCalledWith('paul@paysplit.com', 'Paul');
      expect(provisionMock).toHaveBeenCalledWith(user.id);
      expect(notifyMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: user.id }),
        expect.objectContaining({ type: 'kyc_approved' }),
      );

      expect((notifyMock.mock.calls as unknown[][])[0][1]).not.toHaveProperty('email', true);
    });

    it('fails when no face is detected, without calling face match', async () => {
      await passIdentity();
      dojah.checkLiveness.mockResolvedValue({
        isLive: false,
        probability: 0,
        faceDetected: false,
        multipleFaces: false,
      });

      const { body } = await rejection(service.verifyLiveness('user-1', 'selfie'));

      expect(body.code).toBe('NO_FACE_DETECTED');
      expect(dojah.verifySelfieWithBvn).not.toHaveBeenCalled();
      expect(verification.identityStatus).toBe('passed');
      expect(verification.livenessStatus).toBe('failed');
    });

    it('fails when the liveness probability is below threshold', async () => {
      await passIdentity();
      dojah.checkLiveness.mockResolvedValue({
        isLive: true,
        probability: 50,
        faceDetected: true,
        multipleFaces: false,
      });
      const { body } = await rejection(service.verifyLiveness('user-1', 'selfie'));
      expect(body.code).toBe('LIVENESS_FAILED');
    });

    it('fails on a face mismatch', async () => {
      await passIdentity();
      dojah.verifySelfieWithBvn.mockResolvedValue({
        match: false,
        confidence: 40,
        record: { firstName: null, middleName: null, lastName: null, dateOfBirth: null },
      });
      const { body } = await rejection(service.verifyLiveness('user-1', 'selfie'));
      expect(body.code).toBe('FACE_MISMATCH');
      expect(user.kycStatus).toBe('action_required');
    });

    it('refuses once already approved', async () => {
      user.kycStatus = 'approved';
      const { body } = await rejection(service.verifyLiveness('user-1', 'selfie'));
      expect(body.code).toBe('ALREADY_VERIFIED');
    });
  });

  describe('sandbox mode', () => {
    beforeAll(() => {
      config['dojah.sandboxMode'] = true;
    });
    afterAll(() => {
      delete config['dojah.sandboxMode'];
    });

    const passIdentity = () =>
      service.verifyNigeriaIdentity('user-1', { method: 'bvn', idNumber: '22222222222' });

    it('allows a test BVN already used by another account and stores no fingerprint', async () => {
      otherUserWithId = { userId: 'user-2' } as KycVerification;

      await passIdentity();

      expect(verification.identityStatus).toBe('passed');
      expect(verification.idFingerprint).toBeNull();
    });

    it('skips face match and approves after a passing liveness check', async () => {
      await passIdentity();

      const result = await service.verifyLiveness('user-1', 'selfie');

      expect(dojah.checkLiveness).toHaveBeenCalledWith('selfie');
      expect(dojah.verifySelfieWithBvn).not.toHaveBeenCalled();
      expect(user.kycStatus).toBe('approved');
      expect(result.message).toBe('Identity approved');
      expect(attemptRows.at(-1)?.checks).toContainEqual({
        check: 'face_match_skipped_sandbox',
        passed: true,
      });
    });

    it("ignores the sandbox's canned spoof verdict and approves", async () => {
      await passIdentity();
      dojah.checkLiveness.mockResolvedValue({
        isLive: false,
        probability: 0.003,
        faceDetected: true,
        multipleFaces: false,
      });

      await service.verifyLiveness('user-1', 'selfie');

      expect(user.kycStatus).toBe('approved');
      expect(attemptRows.at(-1)?.checks).toContainEqual({
        check: 'liveness_verdict_skipped_sandbox',
        passed: true,
      });
    });

    it('still fails when no face is detected', async () => {
      await passIdentity();
      dojah.checkLiveness.mockResolvedValue({
        isLive: false,
        probability: null,
        faceDetected: false,
        multipleFaces: false,
      });
      const { body } = await rejection(service.verifyLiveness('user-1', 'selfie'));
      expect(body.code).toBe('NO_FACE_DETECTED');
    });

    it('still enforces the name match', async () => {
      dojah.validateBvn.mockResolvedValue({ valid: true, firstNameScore: 100, lastNameScore: 40 });
      const { body } = await rejection(passIdentity());
      expect(body.code).toBe('NAME_MISMATCH');
    });
  });

  describe('addSalaryAccountIdentity', () => {
    beforeEach(() => {
      user.kycStatus = 'approved';
      Object.assign(verification, {
        region: 'international',
        method: 'passport',
        identityStatus: 'passed',
        livenessStatus: 'passed',
        idNumberEncrypted: crypto.encrypt('A1234567'),
        legalFirstName: 'PAUL',
        legalLastName: 'OBI',
        dateOfBirth: '1990-01-01',
      });
      salaryAccount = { status: 'not_eligible' };
    });

    it('verifies the BVN against the verified name, stores it encrypted and retries the account', async () => {
      const result = await service.addSalaryAccountIdentity('user-1', {
        method: 'bvn',
        idNumber: '22222222222',
      });

      expect(dojah.validateBvn).toHaveBeenCalledWith('22222222222', 'PAUL', 'OBI');
      expect(verification.walletIdMethod).toBe('bvn');
      expect(verification.walletIdLast4).toBe('2222');
      expect(crypto.decrypt(verification.walletIdEncrypted as string)).toBe('22222222222');
      expect(verification.walletIdFingerprint).toBeTruthy();

      expect(verification.method).toBe('passport');
      expect(user.kycStatus).toBe('approved');
      expect(retryMock).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ status: 'active', actionRequired: null });
      expect(JSON.stringify(attemptRows)).not.toContain('22222222222');
    });

    it('is refused when the salary account is active or being set up', async () => {
      salaryAccount = { status: 'active' };
      await expect(
        service.addSalaryAccountIdentity('user-1', { method: 'bvn', idNumber: '22222222222' }),
      ).rejects.toMatchObject({ response: { code: 'SALARY_ACCOUNT_IDENTITY_NOT_NEEDED' } });
      salaryAccount = { status: 'pending' };
      await expect(
        service.addSalaryAccountIdentity('user-1', { method: 'bvn', idNumber: '22222222222' }),
      ).rejects.toMatchObject({ status: 409 });
      expect(dojah.validateBvn).not.toHaveBeenCalled();
    });

    it('requires approved KYC', async () => {
      user.kycStatus = 'in_progress';
      await expect(
        service.addSalaryAccountIdentity('user-1', { method: 'bvn', idNumber: '22222222222' }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('rejects a BVN whose name does not match, without storing it or downgrading KYC', async () => {
      dojah.validateBvn.mockResolvedValue({ valid: true, firstNameScore: 20, lastNameScore: 30 });
      await expect(
        service.addSalaryAccountIdentity('user-1', { method: 'bvn', idNumber: '22222222222' }),
      ).rejects.toMatchObject({ status: 422, response: { code: 'NAME_MISMATCH' } });
      expect(verification.walletIdEncrypted).toBeUndefined();
      expect(user.kycStatus).toBe('approved');
      expect(retryMock).not.toHaveBeenCalled();
    });

    it('rejects a NIN with a different date of birth', async () => {
      dojah.lookupNin.mockResolvedValue({
        firstName: 'PAUL',
        middleName: null,
        lastName: 'OBI',
        dateOfBirth: '02-03-1985',
      });
      await expect(
        service.addSalaryAccountIdentity('user-1', { method: 'nin', idNumber: '70123456789' }),
      ).rejects.toMatchObject({ response: { code: 'DOB_MISMATCH' } });
    });

    it('accepts a NIN whose date of birth matches in another format', async () => {
      dojah.lookupNin.mockResolvedValue({
        firstName: 'PAUL',
        middleName: null,
        lastName: 'OBI',
        dateOfBirth: '01-Jan-1990',
      });
      await service.addSalaryAccountIdentity('user-1', { method: 'nin', idNumber: '70123456789' });
      expect(verification.walletIdMethod).toBe('nin');
      expect(retryMock).toHaveBeenCalled();
    });

    it('rejects an ID linked to another account', async () => {
      otherUserWithId = { userId: 'someone-else' } as never;
      await expect(
        service.addSalaryAccountIdentity('user-1', { method: 'bvn', idNumber: '22222222222' }),
      ).rejects.toMatchObject({ status: 409, response: { code: 'ID_ALREADY_USED' } });
    });
  });
});

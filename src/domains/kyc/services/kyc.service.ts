import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UniqueConstraintError } from 'sequelize';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { UsersService } from '../../users/services/users.service';
import { User } from '../../users/entities/user.entity';
import type { OnboardingStatus } from '../../users/utils/onboarding-status';
import type { KycStatus } from '../../users/constants/kyc-status.constants';
import { DojahService } from '../../../integration/dojah/dojah.service';
import { DojahError } from '../../../integration/dojah/dojah.error';
import { EmailService } from '../../../integration/email/email.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { SalaryAccountProvisioningService } from '../../salary-account/services/salary-account-provisioning.service';
import {
  SalaryAccountService,
  type SalaryAccountView,
} from '../../salary-account/services/salary-account.service';
import { KycVerification } from '../entities/kyc-verification.entity';
import { KycCheckRecord } from '../entities/kyc-attempt.entity';
import { KycVerificationRepository } from '../repository/kyc-verification.repository';
import { KycAttemptRepository } from '../repository/kyc-attempt.repository';
import { KycCryptoService } from './kyc-crypto.service';
import {
  findSupportedCountry,
  SUPPORTED_COUNTRIES,
  SupportedCountry,
} from '../constants/countries.constants';
import {
  KYC_ERROR_CODES,
  KycErrorCode,
  KycMethod,
  KycRegion,
  KycStoredMethod,
  KycStoredRegion,
  KycStep,
  KycStepStatus,
} from '../constants/kyc.constants';
import { matchNames } from '../utils/name-match';
import { normaliseDob } from '../utils/dob';
import { UpdateProfileDto } from '../dtos/update-profile.dto';
import { NigeriaIdentityDto } from '../dtos/nigeria-identity.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

const METHOD_LABELS: Record<KycMethod, string> = {
  bvn: 'BVN',
  nin: 'NIN',
};

export type KycCurrentStep = 'profile' | 'identity' | 'liveness' | 'completed';

interface StepAttempts {
  attemptsRemaining: number;
  retryAvailableAt: Date | null;
}

export interface KycStatusResponse {
  kycStatus: KycStatus;
  currentStep: KycCurrentStep;
  steps: {
    profile: {
      completed: boolean;
      countryCode: string | null;
      phoneNumber: string | null;
      currencyCode: string | null;
    };
    identity: StepAttempts & {
      status: KycStepStatus;
      region: KycStoredRegion | null;
      method: KycStoredMethod | null;
      maskedIdNumber: string | null;
      failureReason: string | null;
    };
    liveness: StepAttempts & {
      status: KycStepStatus;
      failureReason: string | null;
    };
  };
  onboarding: OnboardingStatus;
}

export interface KycApprovedResponse extends KycStatusResponse {
  message: string;
  detail: string;
}

class StepFailure extends Error {
  constructor(
    readonly code: KycErrorCode,
    readonly userMessage: string,
  ) {
    super(code);
  }
}

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);
  private readonly faceMatchThreshold: number;
  private readonly livenessThreshold: number;
  private readonly nameMatchThreshold: number;
  private readonly maxAttempts: Record<KycStep, number>;

  private readonly sandboxMode: boolean;

  constructor(
    private readonly usersService: UsersService,
    private readonly verifications: KycVerificationRepository,
    private readonly attempts: KycAttemptRepository,
    private readonly dojah: DojahService,
    private readonly crypto: KycCryptoService,
    private readonly emailService: EmailService,
    private readonly notifications: NotificationsService,
    private readonly salaryAccounts: SalaryAccountProvisioningService,
    private readonly salaryAccountViews: SalaryAccountService,
    configService: ConfigService,
  ) {
    this.faceMatchThreshold = configService.get<number>('dojah.faceMatchThreshold', 90);
    this.livenessThreshold = configService.get<number>('dojah.livenessThreshold', 80);
    this.nameMatchThreshold = configService.get<number>('dojah.nameMatchThreshold', 80);
    this.maxAttempts = {
      identity: configService.get<number>('kyc.maxIdentityAttemptsPerDay', 3),
      liveness: configService.get<number>('kyc.maxLivenessAttemptsPerDay', 5),
    };
    this.sandboxMode = configService.get<boolean>('dojah.sandboxMode', false) === true;
    if (this.sandboxMode) {
      this.logger.warn(
        'KYC SANDBOX MODE: duplicate-ID, liveness-verdict and face-match checks are disabled (Dojah sandbox URL in use).',
      );
    }
  }

  getCountries(): readonly SupportedCountry[] {
    return SUPPORTED_COUNTRIES;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<KycStatusResponse> {
    const user = await this.loadUser(userId);
    const country = findSupportedCountry(dto.countryCode);
    if (!country) {
      throw this.error(
        HttpStatus.BAD_REQUEST,
        KYC_ERROR_CODES.METHOD_NOT_ALLOWED,
        'Unsupported country',
      );
    }

    const countryChanged = !!user.countryCode && user.countryCode !== country.code;
    if (user.kycStatus === 'approved' && countryChanged) {
      throw this.error(
        HttpStatus.FORBIDDEN,
        KYC_ERROR_CODES.ALREADY_VERIFIED,
        'Your identity is already verified. Contact support to change your country.',
      );
    }

    const phone = parsePhoneNumberFromString(dto.phoneNumber, country.code as CountryCode);
    if (!phone || !phone.isValid() || phone.country !== country.code) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: `Enter a valid ${country.name} mobile number`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const verification = user.kycVerification;
    if (countryChanged && verification && verification.identityStatus !== 'not_started') {
      await this.verifications.update(verification.id, this.resetFields());
    }

    await this.usersService.update(user.id, {
      countryCode: country.code,
      phoneNumber: phone.number,
      currencyCode: country.currency,
    });

    return this.getStatus(user.id);
  }

  async verifyNigeriaIdentity(userId: string, dto: NigeriaIdentityDto): Promise<KycStatusResponse> {
    const user = await this.loadUser(userId);
    this.assertNotApproved(user);
    const country = this.assertProfileComplete(user);
    this.assertMethodAllowed(country, 'nigeria', dto.method);

    const verification = await this.verifications.findOrCreate(user.id);
    const attempts = await this.assertAttemptsAvailable(user, 'identity');

    const fingerprint = this.sandboxMode ? null : this.crypto.fingerprint(dto.method, dto.idNumber);
    const checks: KycCheckRecord[] = [];

    try {
      if (fingerprint) {
        await this.assertIdNotUsedElsewhere(fingerprint, user.id, METHOD_LABELS[dto.method]);
      }

      let nameScore: number;
      let legal: { firstName: string | null; lastName: string | null; dob: string | null } = {
        firstName: null,
        lastName: null,
        dob: null,
      };

      if (dto.method === 'bvn') {
        const result = await this.dojah.validateBvn(dto.idNumber, user.firstName, user.lastName);
        nameScore = Math.min(result.firstNameScore ?? 0, result.lastNameScore ?? 0);
        checks.push({ check: 'validate_bvn', passed: result.valid, score: nameScore });
        if (!result.valid) throw this.notFound('bvn');
      } else {
        const record = await this.dojah.lookupNin(dto.idNumber);
        nameScore = matchNames(user, record).score;
        checks.push({ check: 'lookup_nin', passed: true, score: nameScore });
        legal = { firstName: record.firstName, lastName: record.lastName, dob: record.dateOfBirth };
      }

      if (nameScore < this.nameMatchThreshold) {
        throw new StepFailure(
          KYC_ERROR_CODES.NAME_MISMATCH,
          `The name on your ${METHOD_LABELS[dto.method]} doesn't match the name on your PaySplit account. Please contact support.`,
        );
      }

      await this.verifications.update(verification.id, {
        ...this.resetFields(),
        region: 'nigeria',
        method: dto.method,
        identityStatus: 'passed',
        idNumberEncrypted: this.crypto.encrypt(dto.idNumber),
        idNumberLast4: dto.idNumber.slice(-4),
        idFingerprint: fingerprint,
        nameMatchScore: nameScore,
        legalFirstName: legal.firstName,
        legalLastName: legal.lastName,
        dateOfBirth: legal.dob,
      });
      await this.passStep(user, 'identity', dto.method, checks);
      return this.getStatus(user.id);
    } catch (error) {
      throw await this.handleStepError(
        error,
        user,
        verification,
        'identity',
        dto.method,
        checks,
        attempts,
        {
          region: 'nigeria',
          method: dto.method,
        },
      );
    }
  }

  async verifyLiveness(userId: string, selfieBase64: string): Promise<KycApprovedResponse> {
    const user = await this.loadUser(userId);
    this.assertNotApproved(user);
    this.assertProfileComplete(user);

    const verification = user.kycVerification;
    if (!verification || verification.identityStatus !== 'passed' || !verification.method) {
      throw this.error(
        HttpStatus.CONFLICT,
        KYC_ERROR_CODES.STEP_OUT_OF_ORDER,
        'Complete identity verification before the liveness check.',
      );
    }
    if (verification.method !== 'bvn' && verification.method !== 'nin') {
      throw this.error(
        HttpStatus.CONFLICT,
        KYC_ERROR_CODES.STEP_OUT_OF_ORDER,
        'Complete Nigerian BVN or NIN verification before the liveness check.',
      );
    }

    const method: KycMethod = verification.method;
    const attempts = await this.assertAttemptsAvailable(user, 'liveness');
    const checks: KycCheckRecord[] = [];

    try {
      const liveness = await this.dojah.checkLiveness(selfieBase64);
      if (this.sandboxMode) {
        checks.push({ check: 'liveness_verdict_skipped_sandbox', passed: true });
      } else {
        checks.push({
          check: 'liveness',
          passed: liveness.isLive,
          score: liveness.probability ?? undefined,
        });
      }
      if (!liveness.faceDetected) {
        throw new StepFailure(
          KYC_ERROR_CODES.NO_FACE_DETECTED,
          "We couldn't see a face. Position your face inside the oval and try again.",
        );
      }
      if (liveness.multipleFaces) {
        throw new StepFailure(
          KYC_ERROR_CODES.MULTIPLE_FACES,
          'More than one face was detected. Make sure only you are in the frame.',
        );
      }
      if (
        !this.sandboxMode &&
        (!liveness.isLive || (liveness.probability ?? 0) < this.livenessThreshold)
      ) {
        throw new StepFailure(
          KYC_ERROR_CODES.LIVENESS_FAILED,
          "We couldn't confirm a live photo. Use good lighting, look straight at the camera and try again.",
        );
      }

      let face: Awaited<ReturnType<KycService['matchFace']>>;
      if (this.sandboxMode) {
        face = { check: 'face_match_skipped_sandbox', match: true, confidence: null };
        checks.push({ check: face.check, passed: true });
      } else {
        face = await this.matchFace(verification, method, selfieBase64);
        checks.push({ check: face.check, passed: face.match, score: face.confidence ?? undefined });
        if (!face.match || (face.confidence ?? 0) < this.faceMatchThreshold) {
          throw new StepFailure(
            KYC_ERROR_CODES.FACE_MISMATCH,
            `Your selfie doesn't match the photo on your ${METHOD_LABELS[method]}. Try again in good lighting.`,
          );
        }
      }

      try {
        await this.verifications.update(verification.id, {
          livenessStatus: 'passed',
          livenessScore: liveness.probability,
          faceMatchScore: face.confidence,
          failureReason: null,
          documentImageEncrypted: null,
          approvedAt: new Date(),
          ...(face.legal?.firstName ? { legalFirstName: face.legal.firstName } : {}),
          ...(face.legal?.lastName ? { legalLastName: face.legal.lastName } : {}),
          ...(face.legal?.dob ? { dateOfBirth: face.legal.dob } : {}),
        });
      } catch (error) {
        if (error instanceof UniqueConstraintError) {
          throw new StepFailure(
            KYC_ERROR_CODES.ID_ALREADY_USED,
            `This ${METHOD_LABELS[method]} is already linked to another PaySplit account.`,
          );
        }
        throw error;
      }

      await this.usersService.update(user.id, { kycStatus: 'approved' });
      await this.attempts.record({
        userId: user.id,
        step: 'liveness',
        method,
        outcome: 'passed',
        reason: null,
        checks,
      });
      this.logger.log(`KYC approved for user ${user.id}`);

      this.emailService
        .sendKycApproved(user.email, user.firstName)
        .catch((e: Error) => this.logger.warn(`KYC approval email failed: ${e.message}`));

      await this.notifications.notify(user, {
        type: 'kyc_approved',
        topic: 'accountUpdates',
        title: 'Identity verified',
        body: 'Your identity is verified. Next, set up your salary partitions to start splitting.',
        data: { nextStep: 'setup' },
      });

      void this.salaryAccounts.provision(user.id);

      const status = await this.getStatus(user.id);
      return {
        message: 'Identity approved',
        detail: `Your ${METHOD_LABELS[method]} and liveness check have been authenticated by the provider.`,
        ...status,
      };
    } catch (error) {
      throw await this.handleStepError(
        error,
        user,
        verification,
        'liveness',
        method,
        checks,
        attempts,
      );
    }
  }

  async addSalaryAccountIdentity(
    userId: string,
    dto: NigeriaIdentityDto,
  ): Promise<SalaryAccountView> {
    const user = await this.loadUser(userId);
    if (user.kycStatus !== 'approved') {
      throw this.error(
        HttpStatus.FORBIDDEN,
        KYC_ERROR_CODES.KYC_REQUIRED,
        'Complete identity verification first.',
      );
    }
    const account = await this.salaryAccountViews.findByUserId(user.id);
    const verification = user.kycVerification;
    const canAdd =
      account?.status === 'failed' ||
      account?.status === 'not_eligible' ||
      (!account && !SalaryAccountProvisioningService.hasWalletIdentity(verification ?? null));
    if (!canAdd || !verification) {
      throw this.error(
        HttpStatus.CONFLICT,
        KYC_ERROR_CODES.SALARY_ACCOUNT_IDENTITY_NOT_NEEDED,
        account?.status === 'active'
          ? 'Your salary account is already active.'
          : 'Your salary account is being set up. No action is needed.',
      );
    }

    const attempts = await this.getAttempts(user.id, 'identity');
    if (attempts.attemptsRemaining === 0) {
      throw this.error(
        HttpStatus.TOO_MANY_REQUESTS,
        KYC_ERROR_CODES.ATTEMPTS_EXCEEDED,
        "You've reached today's verification attempt limit. Try again later or contact support.",
        { retryAvailableAt: attempts.retryAvailableAt },
      );
    }

    const method = dto.method;
    const label = METHOD_LABELS[method];
    const attemptMethod = `salary_account_${method}`;
    const fingerprint = this.sandboxMode ? null : this.crypto.fingerprint(method, dto.idNumber);
    const names = {
      firstName: verification.legalFirstName || user.firstName,
      lastName: verification.legalLastName || user.lastName,
    };
    const checks: KycCheckRecord[] = [];

    try {
      if (fingerprint) await this.assertIdNotUsedElsewhere(fingerprint, user.id, label);

      let nameScore: number;
      if (method === 'bvn') {
        const result = await this.dojah.validateBvn(dto.idNumber, names.firstName, names.lastName);
        nameScore = Math.min(result.firstNameScore ?? 0, result.lastNameScore ?? 0);
        checks.push({ check: 'validate_bvn', passed: result.valid, score: nameScore });
        if (!result.valid) throw this.notFound('bvn');
      } else {
        const record = await this.dojah.lookupNin(dto.idNumber);
        nameScore = matchNames(names, record).score;
        checks.push({ check: 'lookup_nin', passed: true, score: nameScore });
        const known = normaliseDob(verification.dateOfBirth);
        const found = normaliseDob(record.dateOfBirth);
        if (known && found && known !== found) {
          checks.push({ check: 'date_of_birth', passed: false });
          throw new StepFailure(
            KYC_ERROR_CODES.DOB_MISMATCH,
            "The date of birth on this NIN doesn't match your verified identity.",
          );
        }
      }
      if (nameScore < this.nameMatchThreshold) {
        throw new StepFailure(
          KYC_ERROR_CODES.NAME_MISMATCH,
          `The name on this ${label} doesn't match your verified identity. Please contact support.`,
        );
      }

      try {
        await this.verifications.update(verification.id, {
          walletIdMethod: method,
          walletIdEncrypted: this.crypto.encrypt(dto.idNumber),
          walletIdLast4: dto.idNumber.slice(-4),
          walletIdFingerprint: fingerprint,
          walletIdVerifiedAt: new Date(),
        });
      } catch (error) {
        if (error instanceof UniqueConstraintError) {
          throw new StepFailure(
            KYC_ERROR_CODES.ID_ALREADY_USED,
            `This ${label} is already linked to another PaySplit account.`,
          );
        }
        throw error;
      }
      await this.attempts.record({
        userId: user.id,
        step: 'identity',
        method: attemptMethod,
        outcome: 'passed',
        reason: null,
        checks,
      });
      this.logger.log(`Salary account ${method.toUpperCase()} added for user ${user.id}`);
    } catch (error) {
      if (error instanceof DojahError && error.isProviderFailure) {
        await this.attempts.record({
          userId: user.id,
          step: 'identity',
          method: attemptMethod,
          outcome: 'provider_error',
          reason: `dojah_${error.status}`,
          checks,
        });
        throw this.error(
          HttpStatus.SERVICE_UNAVAILABLE,
          KYC_ERROR_CODES.PROVIDER_UNAVAILABLE,
          'Identity verification is temporarily unavailable. Please try again shortly.',
        );
      }
      const failure =
        error instanceof StepFailure
          ? error
          : error instanceof DojahError
            ? this.notFound(method)
            : null;
      if (!failure) throw error;
      await this.attempts.record({
        userId: user.id,
        step: 'identity',
        method: attemptMethod,
        outcome: 'failed',
        reason: failure.code,
        checks,
      });
      throw this.error(
        failure.code === KYC_ERROR_CODES.ID_ALREADY_USED
          ? HttpStatus.CONFLICT
          : HttpStatus.UNPROCESSABLE_ENTITY,
        failure.code,
        failure.userMessage,
        { attemptsRemaining: Math.max(0, attempts.attemptsRemaining - 1) },
      );
    }

    await this.salaryAccounts.retryWithNewIdentity(user.id);
    return this.salaryAccountViews.getView(user);
  }

  async getStatus(userId: string): Promise<KycStatusResponse> {
    const user = await this.loadUser(userId);
    const verification = user.kycVerification;
    const [identityAttempts, livenessAttempts] = await Promise.all([
      this.getAttempts(user.id, 'identity'),
      this.getAttempts(user.id, 'liveness'),
    ]);

    const profileCompleted = !!(user.countryCode && user.phoneNumber);
    const identityStatus = verification?.identityStatus ?? 'not_started';
    const livenessStatus = verification?.livenessStatus ?? 'not_started';

    let currentStep: KycCurrentStep = 'completed';
    if (user.kycStatus !== 'approved') {
      if (!profileCompleted) currentStep = 'profile';
      else if (identityStatus !== 'passed') currentStep = 'identity';
      else currentStep = 'liveness';
    }

    return {
      kycStatus: user.kycStatus,
      currentStep,
      steps: {
        profile: {
          completed: profileCompleted,
          countryCode: user.countryCode ?? null,
          phoneNumber: user.phoneNumber ?? null,
          currencyCode: user.currencyCode ?? null,
        },
        identity: {
          status: identityStatus,
          region: verification?.region ?? null,
          method: verification?.method ?? null,
          maskedIdNumber: verification?.idNumberLast4
            ? `*******${verification.idNumberLast4}`
            : null,
          failureReason: identityStatus === 'failed' ? (verification?.failureReason ?? null) : null,
          ...identityAttempts,
        },
        liveness: {
          status: livenessStatus,
          failureReason: livenessStatus === 'failed' ? (verification?.failureReason ?? null) : null,
          ...livenessAttempts,
        },
      },
      onboarding: await this.usersService.getOnboardingStatus(user),
    };
  }

  private async matchFace(
    verification: KycVerification,
    method: KycMethod,
    selfieBase64: string,
  ): Promise<{
    check: string;
    match: boolean;
    confidence: number | null;
    legal?: { firstName: string | null; lastName: string | null; dob: string | null };
  }> {
    const idNumber = this.crypto.decrypt(verification.idNumberEncrypted!);
    const result =
      method === 'bvn'
        ? await this.dojah.verifySelfieWithBvn(idNumber, selfieBase64, this.faceMatchThreshold)
        : await this.dojah.verifySelfieWithNin(idNumber, selfieBase64, this.faceMatchThreshold);
    return {
      check: `selfie_${method}`,
      match: result.match,
      confidence: result.confidence,
      legal: {
        firstName: result.record.firstName,
        lastName: result.record.lastName,
        dob: result.record.dateOfBirth,
      },
    };
  }

  private async passStep(user: User, step: KycStep, method: string, checks: KycCheckRecord[]) {
    if (user.kycStatus !== 'in_progress') {
      await this.usersService.update(user.id, { kycStatus: 'in_progress' });
    }
    await this.attempts.record({
      userId: user.id,
      step,
      method,
      outcome: 'passed',
      reason: null,
      checks,
    });
  }

  private async handleStepError(
    error: unknown,
    user: User,
    verification: KycVerification,
    step: KycStep,
    method: string,
    checks: KycCheckRecord[],
    attempts: StepAttempts,
    extra: { region?: KycRegion; method?: KycMethod } = {},
  ): Promise<HttpException> {
    if (error instanceof DojahError && error.isProviderFailure) {
      await this.attempts.record({
        userId: user.id,
        step,
        method,
        outcome: 'provider_error',
        reason: `dojah_${error.status}`,
        checks,
      });
      return this.error(
        HttpStatus.SERVICE_UNAVAILABLE,
        KYC_ERROR_CODES.PROVIDER_UNAVAILABLE,
        'Identity verification is temporarily unavailable. Please try again shortly.',
      );
    }

    let failure: StepFailure;
    if (error instanceof StepFailure) {
      failure = error;
    } else if (error instanceof DojahError) {
      checks.push({ check: 'provider', httpStatus: error.status, passed: false });
      failure =
        step === 'identity'
          ? this.notFound(method as KycMethod)
          : new StepFailure(
              KYC_ERROR_CODES.INVALID_IMAGE,
              "We couldn't process that photo. Retake it in good lighting.",
            );
    } else if (error instanceof HttpException) {
      return error;
    } else {
      throw error;
    }

    const stepField = step === 'identity' ? 'identityStatus' : 'livenessStatus';
    await this.verifications.update(verification.id, {
      ...(step === 'identity' ? { ...this.resetFields(), ...extra } : {}),
      [stepField]: 'failed',
      failureReason: failure.code,
    });
    await this.usersService.update(user.id, { kycStatus: 'action_required' });
    await this.attempts.record({
      userId: user.id,
      step,
      method,
      outcome: 'failed',
      reason: failure.code,
      checks,
    });

    const status =
      failure.code === KYC_ERROR_CODES.ID_ALREADY_USED
        ? HttpStatus.CONFLICT
        : HttpStatus.UNPROCESSABLE_ENTITY;
    return this.error(status, failure.code, failure.userMessage, {
      attemptsRemaining: Math.max(0, attempts.attemptsRemaining - 1),
    });
  }

  private async getAttempts(userId: string, step: KycStep): Promise<StepAttempts> {
    const rows = await this.attempts.findCounted(userId, step, new Date(Date.now() - DAY_MS));
    const attemptsRemaining = Math.max(0, this.maxAttempts[step] - rows.length);
    const retryAvailableAt =
      attemptsRemaining === 0 && rows.length > 0
        ? new Date(
            new Date(rows[rows.length - this.maxAttempts[step]].createdAt).getTime() + DAY_MS,
          )
        : null;
    return { attemptsRemaining, retryAvailableAt };
  }

  private async assertAttemptsAvailable(user: User, step: KycStep): Promise<StepAttempts> {
    const attempts = await this.getAttempts(user.id, step);
    if (attempts.attemptsRemaining === 0) {
      if (user.kycStatus !== 'action_required') {
        await this.usersService.update(user.id, { kycStatus: 'action_required' });
      }
      throw this.error(
        HttpStatus.TOO_MANY_REQUESTS,
        KYC_ERROR_CODES.ATTEMPTS_EXCEEDED,
        "You've reached today's verification attempt limit. Try again later or contact support.",
        { retryAvailableAt: attempts.retryAvailableAt },
      );
    }
    return attempts;
  }

  private async assertIdNotUsedElsewhere(fingerprint: string, userId: string, label: string) {
    const other = await this.verifications.findOtherUserWithFingerprint(fingerprint, userId);
    if (other) {
      throw new StepFailure(
        KYC_ERROR_CODES.ID_ALREADY_USED,
        `This ${label} is already linked to another PaySplit account.`,
      );
    }
  }

  private assertNotApproved(user: User): void {
    if (user.kycStatus === 'approved') {
      throw this.error(
        HttpStatus.CONFLICT,
        KYC_ERROR_CODES.ALREADY_VERIFIED,
        'Your identity is already verified.',
      );
    }
  }

  private assertProfileComplete(user: User): SupportedCountry {
    const country = findSupportedCountry(user.countryCode);
    if (!country || !user.phoneNumber) {
      throw this.error(
        HttpStatus.CONFLICT,
        KYC_ERROR_CODES.PROFILE_INCOMPLETE,
        'Complete Profile Basics (country and phone number) first.',
      );
    }
    return country;
  }

  private assertMethodAllowed(country: SupportedCountry, region: KycRegion, method: KycMethod) {
    if (country.region !== region || !country.methods.includes(method)) {
      const allowed = country.methods.map((m) => METHOD_LABELS[m]).join(' or ');
      throw this.error(
        HttpStatus.BAD_REQUEST,
        KYC_ERROR_CODES.METHOD_NOT_ALLOWED,
        `Users in ${country.name} must verify with their ${allowed}.`,
      );
    }
  }

  private notFound(method: KycMethod): StepFailure {
    return new StepFailure(
      KYC_ERROR_CODES.IDENTITY_NOT_FOUND,
      `We couldn't find a record for that ${METHOD_LABELS[method]}. Check the number and try again.`,
    );
  }

  private resetFields() {
    return {
      region: null,
      method: null,
      identityStatus: 'not_started' as const,
      livenessStatus: 'not_started' as const,
      idNumberEncrypted: null,
      idNumberLast4: null,
      idFingerprint: null,
      documentImageEncrypted: null,
      legalFirstName: null,
      legalLastName: null,
      dateOfBirth: null,
      nameMatchScore: null,
      faceMatchScore: null,
      livenessScore: null,
      failureReason: null,
    };
  }

  private async loadUser(userId: string): Promise<User> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.UNAUTHORIZED);
    }
    return user;
  }

  private error(
    status: HttpStatus,
    code: KycErrorCode,
    message: string,
    extra: Record<string, unknown> = {},
  ): HttpException {
    return new HttpException({ statusCode: status, code, message, ...extra }, status);
  }
}

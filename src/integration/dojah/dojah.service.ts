import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DojahError } from './dojah.error';
import {
  BvnValidationResult,
  DojahPersonRecord,
  LivenessResult,
  SelfieVerificationResult,
} from './dojah.types';

type Json = Record<string, unknown>;

const RETRYABLE_STATUSES = new Set([408, 424, 429, 500, 502, 503, 504]);
const REQUEST_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 1_000;
const MOCK_BVN = '22222222222';
const MOCK_NIN = '70123456789';
const MOCK_PERSON: DojahPersonRecord = {
  firstName: 'PAUL',
  middleName: null,
  lastName: 'OBI',
  dateOfBirth: '1990-01-01',
};

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
const num = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const obj = (value: unknown): Json =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};

@Injectable()
export class DojahService {
  private readonly logger = new Logger(DojahService.name);
  private readonly baseUrl: string;
  private readonly appId: string;
  private readonly secretKey: string;
  private readonly mockMode: boolean;

  constructor(configService: ConfigService) {
    const provider = configService.get<string>('kyc.provider', 'dojah');
    const env = configService.get<string>('env', 'development');
    if (provider === 'mock' && env === 'production') {
      throw new Error('KYC_PROVIDER=mock cannot be used in production.');
    }
    this.mockMode = provider === 'mock';
    this.baseUrl = configService.get<string>('dojah.baseUrl', 'https://sandbox.dojah.io');
    this.appId = configService.get<string>('dojah.appId', '');
    this.secretKey = configService.get<string>('dojah.secretKey', '');

    if (!this.mockMode && (!this.appId || !this.secretKey)) {
      this.logger.warn('DOJAH_APP_ID / DOJAH_SECRET_KEY not set — KYC checks will fail.');
    }
  }

  async validateBvn(
    bvn: string,
    firstName: string,
    lastName: string,
  ): Promise<BvnValidationResult> {
    if (this.mockMode) {
      const valid = bvn === MOCK_BVN;
      return { valid, firstNameScore: valid ? 100 : 0, lastNameScore: valid ? 100 : 0 };
    }
    const entity = await this.request('GET', '/api/v1/kyc/bvn', {
      query: { bvn, first_name: firstName, last_name: lastName },
    });

    const record = entity.bvn;
    return {
      valid: typeof record === 'string' ? str(record) !== null : obj(record).status === true,
      firstNameScore: num(obj(entity.first_name).confidence_value),
      lastNameScore: num(obj(entity.last_name).confidence_value),
    };
  }

  async lookupNin(nin: string): Promise<DojahPersonRecord> {
    if (this.mockMode) {
      if (nin !== MOCK_NIN) throw new DojahError(404, 'Mock NIN not found');
      return MOCK_PERSON;
    }
    const entity = await this.request('GET', '/api/v1/kyc/nin', { query: { nin } });
    return this.toPersonRecord(entity);
  }

  async verifySelfieWithBvn(
    bvn: string,
    selfieBase64: string,
    threshold: number,
  ): Promise<SelfieVerificationResult> {
    if (this.mockMode) {
      const match = bvn === MOCK_BVN;
      return { match, confidence: match ? 99 : 0, record: MOCK_PERSON };
    }
    return this.verifySelfie('/api/v1/kyc/bvn/verify', { bvn }, selfieBase64, threshold);
  }

  async verifySelfieWithNin(
    nin: string,
    selfieBase64: string,
    threshold: number,
  ): Promise<SelfieVerificationResult> {
    if (this.mockMode) {
      const match = nin === MOCK_NIN;
      return { match, confidence: match ? 99 : 0, record: MOCK_PERSON };
    }
    return this.verifySelfie('/api/v1/kyc/nin/verify', { nin }, selfieBase64, threshold);
  }

  async checkLiveness(imageBase64: string): Promise<LivenessResult> {
    if (this.mockMode) {
      return { isLive: true, probability: 99, faceDetected: true, multipleFaces: false };
    }
    const entity = await this.request('POST', '/api/v1/ml/liveness', {
      body: { image: imageBase64 },
    });
    const liveness = obj(entity.liveness);
    const face = obj(entity.face);

    let isLive: boolean;
    let probability: number | null;
    if (typeof liveness.spoof === 'boolean') {
      const confidence = num(liveness.confidence);
      isLive = liveness.spoof === false;
      probability = confidence === null ? null : isLive ? confidence : 100 - confidence;
    } else {
      isLive = liveness.liveness_check === true;
      probability = num(liveness.liveness_probability);
    }

    const detected = face.face_detected ?? face.detected;
    return {
      isLive,
      probability,
      faceDetected: detected !== false,
      multipleFaces: face.multiface_detected === true,
    };
  }

  private async verifySelfie(
    path: string,
    identifier: Json,
    selfieBase64: string,
    threshold: number,
  ): Promise<SelfieVerificationResult> {
    const entity = await this.request('POST', path, {
      body: { ...identifier, selfie_image: selfieBase64, threshold },
    });
    const selfie = obj(entity.selfie_verification);
    return {
      match: selfie.match === true,
      confidence: num(selfie.confidence_value),
      record: this.toPersonRecord(entity),
    };
  }

  private toPersonRecord(entity: Json): DojahPersonRecord {
    return {
      firstName: str(entity.first_name) ?? str(entity.firstname),
      middleName: str(entity.middle_name) ?? str(entity.middlename),
      lastName: str(entity.last_name) ?? str(entity.surname) ?? str(entity.lastname),
      dateOfBirth: str(entity.date_of_birth) ?? str(entity.birthdate),
    };
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    options: { query?: Record<string, string>; body?: Json },
    attempt = 1,
  ): Promise<Json> {
    if (!this.appId || !this.secretKey) {
      throw new DojahError(0, 'Dojah credentials are not configured');
    }

    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: this.secretKey,
          AppId: this.appId,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`Dojah ${method} ${path} failed: ${(error as Error).name}`);
      if (attempt === 1) return this.retry(method, path, options);
      throw new DojahError(0, 'Dojah request failed');
    }

    if (response.ok) {
      const payload = obj(await response.json().catch(() => ({})));
      return obj(payload.entity);
    }

    const errorBody = obj(await response.json().catch(() => ({})));
    const message = str(errorBody.error) ?? str(errorBody.message) ?? response.statusText;

    this.logger.warn(`Dojah ${method} ${path} -> ${response.status}`);

    if (response.status === 402) {
      this.logger.error('Dojah wallet balance is too low — all KYC checks are failing.');
    }
    if (RETRYABLE_STATUSES.has(response.status) && attempt === 1) {
      return this.retry(method, path, options);
    }
    throw new DojahError(response.status, message);
  }

  private async retry(
    method: 'GET' | 'POST',
    path: string,
    options: { query?: Record<string, string>; body?: Json },
  ): Promise<Json> {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return this.request(method, path, options, 2);
  }
}

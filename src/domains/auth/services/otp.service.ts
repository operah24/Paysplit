import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { OtpRepository } from '../repository/otp.repository';
import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_MINUTES,
  OtpType,
} from '../constants/otp.constants';

export interface VerifyOtpOptions {
  consume: boolean;
}

@Injectable()
export class OtpService {
  private readonly hashKey: string;

  constructor(
    private readonly otpRepository: OtpRepository,
    configService: ConfigService,
  ) {
    this.hashKey = configService.getOrThrow<string>('jwt.secret');
  }

  async issue(email: string, type: OtpType): Promise<string> {
    await this.otpRepository.deleteByEmailAndType(email, type);

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const otpExpiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

    await this.otpRepository.create({ email, type, codeHash: this.hash(code), otpExpiresAt });
    return code;
  }

  async getResendCooldown(email: string, type: OtpType): Promise<number> {
    const latest = await this.otpRepository.findLatest(email, type);
    if (!latest) return 0;

    const elapsedSeconds = (Date.now() - new Date(latest.createdAt).getTime()) / 1000;
    return Math.max(0, Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds));
  }

  async verify(
    email: string,
    type: OtpType,
    code: string,
    { consume }: VerifyOtpOptions,
  ): Promise<boolean> {
    const otp = await this.otpRepository.findLatest(email, type);
    if (!otp) return false;

    if (new Date() > otp.otpExpiresAt || otp.attempts >= OTP_MAX_ATTEMPTS) {
      await this.otpRepository.deleteById(otp.id);
      return false;
    }

    if (!this.matches(code, otp.codeHash)) {
      if (otp.attempts + 1 >= OTP_MAX_ATTEMPTS) {
        await this.otpRepository.deleteById(otp.id);
      } else {
        await this.otpRepository.incrementAttempts(otp.id);
      }
      return false;
    }

    if (consume) {
      await this.otpRepository.deleteById(otp.id);
    } else {
      await this.otpRepository.markAsVerified(otp.id);
    }
    return true;
  }

  async hasVerified(email: string, type: OtpType): Promise<boolean> {
    const otp = await this.otpRepository.findVerified(email, type);
    return !!otp && new Date() <= otp.otpExpiresAt;
  }

  async consumeVerified(email: string, type: OtpType): Promise<void> {
    const otp = await this.otpRepository.findVerified(email, type);
    if (otp) await this.otpRepository.deleteById(otp.id);
  }

  private hash(code: string): string {
    return createHmac('sha256', this.hashKey).update(code).digest('hex');
  }

  private matches(code: string, storedHash: string): boolean {
    const candidate = Buffer.from(this.hash(code), 'hex');
    const stored = Buffer.from(storedHash, 'hex');
    return candidate.length === stored.length && timingSafeEqual(candidate, stored);
  }
}

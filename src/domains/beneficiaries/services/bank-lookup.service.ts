import { Injectable, Logger } from '@nestjs/common';
import { HepaidService } from '../../../integration/hepaid/hepaid.service';
import { HepaidError } from '../../../integration/hepaid/hepaid.error';
import { HepaidBank } from '../../../integration/hepaid/hepaid.types';
import { AppError } from '../../../shared/utils/app-error.util';

export const BANK_ERROR_CODES = {
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  UNKNOWN_BANK: 'UNKNOWN_BANK',
  BANK_LOOKUP_UNAVAILABLE: 'BANK_LOOKUP_UNAVAILABLE',
  BANK_LOOKUP_FAILED: 'BANK_LOOKUP_FAILED',
} as const;

export interface ResolvedAccount {
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
}

const RESOLVE_CACHE_TTL_MS = 30 * 60 * 1000;
const RESOLVE_CACHE_MAX = 5_000;

@Injectable()
export class BankLookupService {
  private readonly logger = new Logger(BankLookupService.name);
  private readonly resolved = new Map<string, { account: ResolvedAccount; at: number }>();

  constructor(private readonly hepaid: HepaidService) {}

  async listBanks(): Promise<HepaidBank[]> {
    try {
      return await this.hepaid.listBanks('NGN');
    } catch (error) {
      throw this.mapError(error, 'bank list');
    }
  }

  async resolve(bankCode: string, accountNumber: string): Promise<ResolvedAccount> {
    const key = `${bankCode}:${accountNumber}`;
    const cached = this.resolved.get(key);
    if (cached && Date.now() - cached.at < RESOLVE_CACHE_TTL_MS) return cached.account;

    const bank = (await this.listBanks()).find((b) => b.code === bankCode);
    if (!bank) {
      throw AppError.unprocessable(BANK_ERROR_CODES.UNKNOWN_BANK, 'Choose a bank from the list.');
    }

    try {
      const result = await this.hepaid.resolveAccount(bankCode, accountNumber);
      const account: ResolvedAccount = {
        bankCode,
        bankName: bank.name,
        accountNumber,
        accountName: result.accountName.trim(),
      };
      if (this.resolved.size >= RESOLVE_CACHE_MAX) this.resolved.clear();
      this.resolved.set(key, { account, at: Date.now() });
      return account;
    } catch (error) {
      throw this.mapError(error, 'name enquiry');
    }
  }

  private mapError(error: unknown, what: string): unknown {
    if (!(error instanceof HepaidError)) return error;
    this.logger.warn(`HePaid ${what} failed: ${error.status} ${error.code}`);

    if (error.code === 'invalid_recipient' || error.code === 'validation_failed') {
      return AppError.unprocessable(
        BANK_ERROR_CODES.ACCOUNT_NOT_FOUND,
        "We couldn't find an account with these details. Check the bank and account number.",
      );
    }
    if (error.isProviderFailure) {
      return AppError.unavailable(
        BANK_ERROR_CODES.BANK_LOOKUP_UNAVAILABLE,
        "We can't reach the banks right now. Please try again in a few minutes.",
      );
    }
    return AppError.badGateway(
      BANK_ERROR_CODES.BANK_LOOKUP_FAILED,
      'Account lookup failed. Please try again.',
    );
  }
}

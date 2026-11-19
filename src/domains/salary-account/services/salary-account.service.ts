import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { User } from '../../users/entities/user.entity';
import { LedgerService } from '../../ledger/services/ledger.service';
import { DEFAULT_CURRENCY } from '../../ledger/constants/ledger.constants';
import { maskAccountNumber } from '../../beneficiaries/entities/beneficiary.entity';
import { SalaryAccount } from '../entities/salary-account.entity';

export type SalaryAccountStatus =
  'not_issued' | 'pending' | 'active' | 'failed' | 'closed' | 'not_eligible';

export interface FundingAccountView {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export interface SalaryAccountView {
  status: SalaryAccountStatus;

  balance: number;
  currency: string;
  accountName: string;

  accountNumber: string | null;
  maskedAccountNumber: string | null;
  bankName: string | null;

  accounts: FundingAccountView[];

  actionRequired: 'add_bvn_or_nin' | null;
}

export type SalaryAccountSummary = Pick<
  SalaryAccountView,
  'status' | 'bankName' | 'maskedAccountNumber' | 'currency'
>;

export function userTier(user: User): 1 | 2 {
  return user.kycStatus === 'approved' ? 2 : 1;
}

@Injectable()
export class SalaryAccountService {
  constructor(
    private readonly ledger: LedgerService,
    @InjectModel(SalaryAccount) private readonly accounts: typeof SalaryAccount,
  ) {}

  findByUserId(userId: string): Promise<SalaryAccount | null> {
    return this.accounts.findOne({ where: { userId } });
  }

  async findActive(userId: string): Promise<SalaryAccount | null> {
    const account = await this.findByUserId(userId);
    return account?.status === 'active' ? account : null;
  }

  async getView(user: User): Promise<SalaryAccountView> {
    const [ledgerAccount, record] = await Promise.all([
      this.ledger.findSalaryAccount(user.id),
      this.findByUserId(user.id),
    ]);
    return {
      ...SalaryAccountService.accountFields(record),
      balance: ledgerAccount?.balance ?? 0,
      currency: ledgerAccount?.currency ?? DEFAULT_CURRENCY,
      accountName: record?.accountName || `${user.firstName} ${user.lastName}`.trim(),
    };
  }

  async summaries(userIds: string[]): Promise<Map<string, SalaryAccountSummary>> {
    const records = userIds.length
      ? await this.accounts.findAll({ where: { userId: userIds } })
      : [];
    const byUser = new Map(records.map((record) => [record.userId, record]));
    return new Map(
      userIds.map((id) => {
        const fields = SalaryAccountService.accountFields(byUser.get(id) ?? null);
        return [
          id,
          {
            status: fields.status,
            bankName: fields.bankName,
            maskedAccountNumber: fields.maskedAccountNumber,
            currency: DEFAULT_CURRENCY,
          },
        ];
      }),
    );
  }

  static accountFields(
    record: SalaryAccount | null,
  ): Pick<
    SalaryAccountView,
    'status' | 'accountNumber' | 'maskedAccountNumber' | 'bankName' | 'accounts' | 'actionRequired'
  > {
    if (!record) {
      return {
        status: 'not_issued',
        accountNumber: null,
        maskedAccountNumber: null,
        bankName: null,
        accounts: [],
        actionRequired: null,
      };
    }
    const active = record.status === 'active';
    const accounts = active
      ? (record.accounts ?? []).map((a) => ({
          bankName: a.bankName,
          accountNumber: a.accountNumber,
          accountName: a.accountName,
        }))
      : [];
    const primary = accounts[0] ?? null;
    return {
      status: record.status,
      accountNumber: primary?.accountNumber ?? null,
      maskedAccountNumber: primary ? maskAccountNumber(primary.accountNumber) : null,
      bankName: primary?.bankName ?? null,
      accounts,
      actionRequired:
        record.status === 'failed' || record.status === 'not_eligible' ? 'add_bvn_or_nin' : null,
    };
  }
}

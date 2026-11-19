import { User } from '../../users/entities/user.entity';
import { SalaryProfile } from '../../income/entities/salary-profile.entity';
import type { KycStatus } from '../../users/constants/kyc-status.constants';
import type { KycStoredMethod } from '../../kyc/constants/kyc.constants';
import type {
  SalaryAccountStatus,
  SalaryAccountSummary,
} from '../../salary-account/services/salary-account.service';
import { nextPayday, ordinal } from '../../../shared/utils/payday.util';

export const PAY_IN_BLOCKERS = {
  ACCOUNT_DEACTIVATED: 'ACCOUNT_DEACTIVATED',
  KYC_NOT_APPROVED: 'KYC_NOT_APPROVED',
  SALARY_ACCOUNT_NOT_READY: 'SALARY_ACCOUNT_NOT_READY',
} as const;

export type PayInBlocker = (typeof PAY_IN_BLOCKERS)[keyof typeof PAY_IN_BLOCKERS];

export interface PayInEligibility {
  eligible: boolean;
  reason: PayInBlocker | null;
  message: string | null;
}

export interface AdminKycSummary {
  status: KycStatus;
  verified: boolean;
  method: KycStoredMethod | null;

  methodLabel: string | null;
  livenessPassed: boolean;

  summary: string | null;
}

export interface SalaryPaidTotals {
  total: number;
  lastPaidAt: Date | null;
}

export interface AdminUserRow {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  profileImageUrl: string | null;
  countryCode: string | null;
  isActive: boolean;
  joinedAt: Date;
  kyc: AdminKycSummary;
  salaryAccount: SalaryAccountSummary;

  salary: {
    employerName: string;

    monthlyAmount: number;
    currency: string;
    paydayDay: number;

    paydayLabel: string;

    nextPayday: string;
  } | null;

  totalSalaryPaid: number;
  lastPaidAt: Date | null;
  payIn: PayInEligibility;
}

const METHOD_LABELS: Record<KycStoredMethod, string> = {
  bvn: 'BVN',
  nin: 'NIN',
  passport: 'Passport',
  drivers_license: "Driver's licence",
};

export function kycMethodLabel(method: KycStoredMethod | null | undefined): string | null {
  return method ? (METHOD_LABELS[method] ?? method.toUpperCase()) : null;
}

export function kycSummary(user: User): AdminKycSummary {
  const kyc = user.kycVerification ?? null;
  const method = kyc?.method ?? null;
  const methodLabel = kycMethodLabel(method);
  const identityPassed = kyc?.identityStatus === 'passed';
  const livenessPassed = kyc?.livenessStatus === 'passed';

  const parts = [identityPassed ? methodLabel : null, livenessPassed ? 'Biometrics' : null].filter(
    (part): part is string => !!part,
  );
  return {
    status: user.kycStatus,
    verified: user.kycStatus === 'approved',
    method,
    methodLabel,
    livenessPassed,
    summary: parts.length ? parts.join(' + ') : null,
  };
}

export function maskIdNumber(last4: string | null | undefined): string | null {
  return last4 ? `*******${last4}` : null;
}

export function payInEligibility(
  user: Pick<User, 'isActive' | 'deactivatedAt' | 'kycStatus'>,
  accountStatus: SalaryAccountStatus,
): PayInEligibility {
  const blocked = (reason: PayInBlocker, message: string): PayInEligibility => ({
    eligible: false,
    reason,
    message,
  });
  if (user.isActive === false || user.deactivatedAt) {
    return blocked(PAY_IN_BLOCKERS.ACCOUNT_DEACTIVATED, 'This account is deactivated.');
  }
  if (user.kycStatus !== 'approved') {
    return blocked(PAY_IN_BLOCKERS.KYC_NOT_APPROVED, 'Identity verification is not approved yet.');
  }
  if (accountStatus !== 'active') {
    return blocked(
      PAY_IN_BLOCKERS.SALARY_ACCOUNT_NOT_READY,
      accountStatus === 'pending'
        ? 'The salary account is still being set up.'
        : 'No salary account has been issued yet.',
    );
  }
  return { eligible: true, reason: null, message: null };
}

export function toAdminUserRow(
  user: User,
  profile: SalaryProfile | null,
  paid: SalaryPaidTotals | undefined,
  account: SalaryAccountSummary,
  now: Date = new Date(),
): AdminUserRow {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    email: user.email,
    profileImageUrl: user.profileImageUrl ?? null,
    countryCode: user.countryCode ?? null,
    isActive: user.isActive !== false && !user.deactivatedAt,
    joinedAt: user.createdAt,
    kyc: kycSummary(user),
    salaryAccount: account,
    salary: profile
      ? {
          employerName: profile.employerName,
          monthlyAmount: profile.monthlyAmount,
          currency: profile.currency,
          paydayDay: profile.paydayDay,
          paydayLabel: ordinal(profile.paydayDay),
          nextPayday: nextPayday(profile.paydayDay, now),
        }
      : null,
    totalSalaryPaid: paid?.total ?? 0,
    lastPaidAt: paid?.lastPaidAt ?? null,
    payIn: payInEligibility(user, account.status),
  };
}

import { User } from '../../users/entities/user.entity';
import { SalaryProfile } from '../../income/entities/salary-profile.entity';
import {
  PAY_IN_BLOCKERS,
  kycSummary,
  maskIdNumber,
  payInEligibility,
  toAdminUserRow,
} from './admin-user-view.util';

const makeUser = (overrides: Record<string, unknown> = {}): User =>
  ({
    id: 'u-1',
    firstName: 'Paul',
    lastName: 'Clarke',
    email: 'paul@paysplit.test',
    profileImageUrl: null,
    countryCode: 'NG',
    isActive: true,
    deactivatedAt: null,
    kycStatus: 'approved',
    createdAt: new Date('2026-10-01T09:00:00Z'),
    kycVerification: { method: 'bvn', identityStatus: 'passed', livenessStatus: 'passed' },
    ...overrides,
  }) as unknown as User;

const UNISSUED = {
  status: 'not_issued' as const,
  bankName: null,
  maskedAccountNumber: null,
  currency: 'NGN',
};

describe('admin user view helpers', () => {
  describe('kycSummary', () => {
    it('summarises passed checks as "BVN + Biometrics"', () => {
      expect(kycSummary(makeUser())).toEqual({
        status: 'approved',
        verified: true,
        method: 'bvn',
        methodLabel: 'BVN',
        livenessPassed: true,
        summary: 'BVN + Biometrics',
      });
    });

    it('lists only the checks that passed', () => {
      const user = makeUser({
        kycStatus: 'in_progress',
        kycVerification: { method: 'nin', identityStatus: 'passed', livenessStatus: 'failed' },
      });
      expect(kycSummary(user)).toMatchObject({ verified: false, summary: 'NIN' });
    });

    it('has no summary before KYC starts', () => {
      const user = makeUser({ kycStatus: 'not_started', kycVerification: null });
      expect(kycSummary(user)).toMatchObject({ method: null, methodLabel: null, summary: null });
    });
  });

  it('masks identity numbers down to the last four digits', () => {
    expect(maskIdNumber('6373')).toBe('*******6373');
    expect(maskIdNumber(null)).toBeNull();
  });

  describe('payInEligibility', () => {
    it('blocks every user until a salary account is active', () => {
      expect(payInEligibility(makeUser(), 'not_issued')).toMatchObject({
        eligible: false,
        reason: PAY_IN_BLOCKERS.SALARY_ACCOUNT_NOT_READY,
      });
      expect(payInEligibility(makeUser(), 'pending').message).toMatch(/being set up/);
    });

    it('allows a verified user with an active account', () => {
      expect(payInEligibility(makeUser(), 'active')).toEqual({
        eligible: true,
        reason: null,
        message: null,
      });
    });

    it('checks deactivation before KYC', () => {
      const user = makeUser({ isActive: false, kycStatus: 'in_progress' });
      expect(payInEligibility(user, 'active').reason).toBe(PAY_IN_BLOCKERS.ACCOUNT_DEACTIVATED);
      expect(payInEligibility(makeUser({ kycStatus: 'in_progress' }), 'active').reason).toBe(
        PAY_IN_BLOCKERS.KYC_NOT_APPROVED,
      );
    });
  });

  describe('toAdminUserRow', () => {
    it('builds a Manage Users row', () => {
      const profile = {
        employerName: 'Talent Nation',
        monthlyAmount: 85_000_000,
        currency: 'NGN',
        paydayDay: 28,
      } as SalaryProfile;
      const lastPaidAt = new Date('2026-10-28T10:00:00Z');

      const row = toAdminUserRow(
        makeUser(),
        profile,
        { total: 170_000_000, lastPaidAt },
        UNISSUED,
        new Date('2026-11-09T12:00:00Z'),
      );

      expect(row).toMatchObject({
        fullName: 'Paul Clarke',
        isActive: true,
        salary: {
          monthlyAmount: 85_000_000,
          paydayLabel: '28th',
          nextPayday: '2026-11-28',
        },
        totalSalaryPaid: 170_000_000,
        lastPaidAt,
        salaryAccount: UNISSUED,
        payIn: { eligible: false },
      });
    });

    it('handles a user with no salary profile or payments', () => {
      const row = toAdminUserRow(makeUser(), null, undefined, UNISSUED);
      expect(row.salary).toBeNull();
      expect(row.totalSalaryPaid).toBe(0);
      expect(row.lastPaidAt).toBeNull();
    });
  });
});

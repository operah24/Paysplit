import { buildOnboardingStatus } from './onboarding-status';
import { User } from '../entities/user.entity';
import { EMPTY_SETUP_PROGRESS } from '../repository/setup-progress.repository';

const user = (overrides: Partial<User> = {}) =>
  ({
    isEmailVerified: true,
    passwordSetAt: new Date(),
    countryCode: null,
    phoneNumber: null,
    kycStatus: 'not_started',
    ...overrides,
  }) as User;

const verified = () =>
  user({ countryCode: 'NG', phoneNumber: '+2348012345678', kycStatus: 'approved' });

describe('buildOnboardingStatus', () => {
  it('sends a freshly signed-up user to KYC', () => {
    expect(buildOnboardingStatus(user())).toEqual({
      emailVerified: true,
      passwordSet: true,
      profileCompleted: false,
      kycStatus: 'not_started',
      kyc: { identityStatus: 'not_started', livenessStatus: 'not_started' },
      setupChecklist: {
        salaryDateSet: false,
        hasWallet: false,
        hasBeneficiary: false,
        hasSplitRule: false,
        completed: false,
      },
      progress: {
        signupCompleted: true,
        kycCompleted: false,
        setupCompleted: false,
        percent: 34,
      },
      nextStep: 'kyc',
    });
  });

  it('keeps pointing at KYC until it is approved', () => {
    const status = buildOnboardingStatus(
      user({ countryCode: 'NG', phoneNumber: '+2348012345678', kycStatus: 'pending_review' }),
    );
    expect(status.profileCompleted).toBe(true);
    expect(status.nextStep).toBe('kyc');
  });

  it('moves to setup once profile and KYC are done', () => {
    const status = buildOnboardingStatus(verified());
    expect(status.nextStep).toBe('setup');
    expect(status.progress.percent).toBe(67);
  });

  it('reflects each setup step individually', () => {
    const status = buildOnboardingStatus(verified(), {
      ...EMPTY_SETUP_PROGRESS,
      hasWallet: true,
      hasBeneficiary: true,
    });
    expect(status.setupChecklist).toMatchObject({
      salaryDateSet: false,
      hasWallet: true,
      hasBeneficiary: true,
      hasSplitRule: false,
      completed: false,
    });
    expect(status.nextStep).toBe('setup');
  });

  it('completes setup with a salary source and a first rule, and sends the user to the dashboard', () => {
    const status = buildOnboardingStatus(verified(), {
      hasIncome: true,
      hasWallet: true,
      hasBeneficiary: false,
      hasSplitRule: true,
    });
    expect(status.setupChecklist.completed).toBe(true);
    expect(status.progress).toEqual({
      signupCompleted: true,
      kycCompleted: true,
      setupCompleted: true,
      percent: 100,
    });
    expect(status.nextStep).toBe('dashboard');
  });
});

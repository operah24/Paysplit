import { User } from '../entities/user.entity';
import { KycStatus } from '../constants/kyc-status.constants';
import type { KycStepStatus } from '../../kyc/constants/kyc.constants';
import { EMPTY_SETUP_PROGRESS, SetupProgressFlags } from '../repository/setup-progress.repository';

export type OnboardingNextStep = 'kyc' | 'setup' | 'dashboard';

export interface OnboardingStatus {
  emailVerified: boolean;
  passwordSet: boolean;

  profileCompleted: boolean;

  kycStatus: KycStatus;

  kyc: {
    identityStatus: KycStepStatus;
    livenessStatus: KycStepStatus;
  };

  setupChecklist: {
    salaryDateSet: boolean;

    hasWallet: boolean;

    hasBeneficiary: boolean;

    hasSplitRule: boolean;

    completed: boolean;
  };

  progress: {
    signupCompleted: boolean;
    kycCompleted: boolean;
    setupCompleted: boolean;

    percent: number;
  };

  nextStep: OnboardingNextStep;
}

export function buildOnboardingStatus(
  user: User,
  setup: SetupProgressFlags = EMPTY_SETUP_PROGRESS,
): OnboardingStatus {
  const profileCompleted = !!(user.countryCode && user.phoneNumber);
  const kycStatus = user.kycStatus ?? 'not_started';
  const setupCompleted = setup.hasIncome && setup.hasSplitRule;

  const signupCompleted = user.isEmailVerified && !!user.passwordSetAt;
  const kycCompleted = kycStatus === 'approved';
  const doneItems = [signupCompleted, kycCompleted, setupCompleted].filter(Boolean).length;

  let nextStep: OnboardingNextStep = 'dashboard';
  if (!profileCompleted || !kycCompleted) {
    nextStep = 'kyc';
  } else if (!setupCompleted) {
    nextStep = 'setup';
  }

  return {
    emailVerified: user.isEmailVerified,
    passwordSet: !!user.passwordSetAt,
    profileCompleted,
    kycStatus,
    kyc: {
      identityStatus: user.kycVerification?.identityStatus ?? 'not_started',
      livenessStatus: user.kycVerification?.livenessStatus ?? 'not_started',
    },
    setupChecklist: {
      salaryDateSet: setup.hasIncome,
      hasWallet: setup.hasWallet,
      hasBeneficiary: setup.hasBeneficiary,
      hasSplitRule: setup.hasSplitRule,
      completed: setupCompleted,
    },
    progress: {
      signupCompleted,
      kycCompleted,
      setupCompleted,
      percent: Math.ceil((doneItems / 3) * 100),
    },
    nextStep,
  };
}

export const KYC_REGIONS = ['nigeria'] as const;
export type KycRegion = (typeof KYC_REGIONS)[number];
export type KycStoredRegion = KycRegion | 'international';

export const KYC_METHODS = ['bvn', 'nin'] as const;
export type KycMethod = (typeof KYC_METHODS)[number];
export type KycStoredMethod = KycMethod | 'passport' | 'drivers_license';

export const NIGERIA_METHODS = ['bvn', 'nin'] as const;
export type NigeriaMethod = (typeof NIGERIA_METHODS)[number];

export const KYC_STEP_STATUSES = ['not_started', 'passed', 'failed'] as const;
export type KycStepStatus = (typeof KYC_STEP_STATUSES)[number];

export const KYC_STEPS = ['identity', 'liveness'] as const;
export type KycStep = (typeof KYC_STEPS)[number];

export type KycAttemptOutcome = 'passed' | 'failed' | 'provider_error';

export const KYC_ERROR_CODES = {
  PROFILE_INCOMPLETE: 'PROFILE_INCOMPLETE',
  STEP_OUT_OF_ORDER: 'STEP_OUT_OF_ORDER',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  ALREADY_VERIFIED: 'ALREADY_VERIFIED',
  ATTEMPTS_EXCEEDED: 'ATTEMPTS_EXCEEDED',
  IDENTITY_NOT_FOUND: 'IDENTITY_NOT_FOUND',
  NAME_MISMATCH: 'NAME_MISMATCH',
  ID_ALREADY_USED: 'ID_ALREADY_USED',
  NO_FACE_DETECTED: 'NO_FACE_DETECTED',
  MULTIPLE_FACES: 'MULTIPLE_FACES',
  LIVENESS_FAILED: 'LIVENESS_FAILED',
  FACE_MISMATCH: 'FACE_MISMATCH',
  INVALID_IMAGE: 'INVALID_IMAGE',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  KYC_REQUIRED: 'KYC_REQUIRED',
  DOB_MISMATCH: 'DOB_MISMATCH',
  SALARY_ACCOUNT_IDENTITY_NOT_NEEDED: 'SALARY_ACCOUNT_IDENTITY_NOT_NEEDED',
} as const;
export type KycErrorCode = (typeof KYC_ERROR_CODES)[keyof typeof KYC_ERROR_CODES];

export const KYC_MAX_IMAGE_BYTES = 2 * 1024 * 1024;

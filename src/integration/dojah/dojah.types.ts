export interface DojahPersonRecord {
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;

  dateOfBirth: string | null;
}

export interface BvnValidationResult {
  valid: boolean;

  firstNameScore: number | null;
  lastNameScore: number | null;
}

export interface SelfieVerificationResult {
  match: boolean;

  confidence: number | null;
  record: DojahPersonRecord;
}

export interface LivenessResult {
  isLive: boolean;

  probability: number | null;
  faceDetected: boolean;
  multipleFaces: boolean;
}

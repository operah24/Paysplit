export const KYC_STATUSES = [
  'not_started',
  'in_progress',
  'pending_review',
  'action_required',
  'approved',
  'rejected',
  'reverification_required',
] as const;

export type KycStatus = (typeof KYC_STATUSES)[number];

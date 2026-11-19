export const AUTO_SPLIT_MIN_SHARE_BPS = 5_000;

export const PAYOUT_DISPATCH_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export const PAYOUT_SYNC_MIN_AGE_MS = 30_000;

export type SplitRunTrigger = 'auto' | 'manual';
export type SplitRunStatus = 'processing' | 'completed' | 'partial' | 'failed';

export type SplitSkipReason =
  'insufficient_funds' | 'below_minimum' | 'destination_paused' | 'destination_missing';

export const SPLIT_ENGINE_ERROR_CODES = {
  NO_ACTIVE_RULES: 'NO_ACTIVE_RULES',
  NOTHING_TO_SPLIT: 'NOTHING_TO_SPLIT',
  SALARY_ACCOUNT_NOT_ACTIVE: 'SALARY_ACCOUNT_NOT_ACTIVE',
  SPLIT_RUN_NOT_FOUND: 'SPLIT_RUN_NOT_FOUND',
  SIMULATION_DISABLED: 'SIMULATION_DISABLED',
} as const;

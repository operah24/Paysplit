export type LedgerAccountType = 'salary' | 'wallet' | 'system';

export const SYSTEM_ACCOUNTS = {
  EXTERNAL_INFLOW: 'external_inflow',
  PAYOUT_CLEARING: 'payout_clearing',
  EXTERNAL_OUTFLOW: 'external_outflow',
  PROVIDER_FEES: 'provider_fees',
} as const;

export type SystemAccountCode = (typeof SYSTEM_ACCOUNTS)[keyof typeof SYSTEM_ACCOUNTS];

export const LEDGER_TRANSACTION_TYPES = {
  SALARY_CREDIT: 'salary_credit',

  WALLET_ALLOCATION: 'wallet_allocation',

  BENEFICIARY_PAYOUT: 'beneficiary_payout',

  WALLET_WITHDRAWAL: 'wallet_withdrawal',
} as const;

export type LedgerTransactionType =
  (typeof LEDGER_TRANSACTION_TYPES)[keyof typeof LEDGER_TRANSACTION_TYPES];

export type LedgerTransactionStatus = 'pending' | 'success' | 'failed' | 'reversed';

export const DEFAULT_CURRENCY = 'NGN';

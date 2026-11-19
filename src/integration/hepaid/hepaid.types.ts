export interface HepaidEnvelope<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; details: Record<string, unknown> | null } | null;
}

export interface HepaidPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface HepaidBank {
  code: string;
  name: string;
}

export interface HepaidResolvedAccount {
  bankCode: string;
  accountNumber: string;
  accountName: string;
  bankName: string | null;
}

export interface HepaidBankAccount {
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export interface HepaidCustomer {
  id: string;
  email: string;
  name: string | null;
  externalId: string | null;
  phone: string | null;
}

export type HepaidWalletStatus = 'Pending' | 'Active' | 'Failed' | 'Closed';

export interface HepaidWallet {
  id: string;
  reference: string;
  mode: 'Test' | 'Live';
  status: HepaidWalletStatus;
  currency: string;
  customer: HepaidCustomer;
  fundingAccount: {
    accountName: string;
    accounts: HepaidBankAccount[];
    identityType: 'None' | 'Bvn' | 'Nin';
    gateway: string;
  } | null;
  balance: { available: number; inTransit: number };
  metadata: Record<string, string> | null;
  failureReason: string | null;
  createdAt: string;
  closedAt: string | null;
  link: { status: 'Pending' | 'Active' | 'Declined' } | null;
}

export interface CreateHepaidWalletInput {
  reference: string;
  customer: { email: string; externalId: string; name?: string };
  identity?: { type: 'Bvn' | 'Nin'; number: string };
  accountName?: string;
  currency?: string;
  metadata?: Record<string, string>;
}

export type HepaidWalletEntryType =
  | 'TopUp'
  | 'Withdrawal'
  | 'WithdrawalReturned'
  | 'WithdrawalReversed'
  | 'Adjustment'
  | 'Credit'
  | 'MoveIn'
  | 'MoveOut'
  | 'Payment'
  | 'PaymentRefund'
  | 'TransferIn'
  | 'TransferOut';

export interface HepaidSender {
  accountName: string | null;
  accountNumber: string | null;
  bankCode: string | null;
  sessionId: string | null;
}

export interface HepaidWalletEntry {
  id: string;
  type: HepaidWalletEntryType;

  amount: number;
  fee: number;
  balanceAfter: number;
  description: string | null;
  reference: string | null;
  createdAt: string;

  sender?: HepaidSender | null;
}

export type HepaidTransferStatus = 'Pending' | 'Processing' | 'Succeeded' | 'Failed' | 'Reversed';

export interface HepaidTransfer {
  id: string;
  reference: string;
  batchReference: string | null;
  sourceWallet: string | null;
  mode: 'Test' | 'Live';
  status: HepaidTransferStatus;
  amount: number;
  currency: string;
  fee: number;
  recipient: HepaidBankAccount;
  narration: string;
  metadata: Record<string, string> | null;
  gateway: string | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface CreateHepaidTransferInput {
  reference: string;
  amount: number;
  currency?: string;
  recipient: { bankCode: string; bankName?: string; accountNumber: string; accountName: string };
  narration: string;
  sourceWallet?: string;
  metadata?: Record<string, string>;
}

export interface HepaidBalance {
  currency: string;
  mode: 'Test' | 'Live';
  available: number;
  inTransit: number;
}

export interface HepaidWebhookEvent<T = unknown> {
  id: string;
  type: string;
  createdAt: string;
  mode: 'Test' | 'Live';
  data: T;
}

export interface HepaidWalletCreditedData {
  transaction: { id: string; reference: string; sender?: HepaidSender | null };
  wallet: { id: string; reference: string };
}

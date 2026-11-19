import {
  MAX_PROVIDER_RETRIES,
  SalaryAccountProvisioningService,
} from './salary-account-provisioning.service';
import { HepaidError } from '../../../integration/hepaid/hepaid.error';
import type { HepaidWallet } from '../../../integration/hepaid/hepaid.types';

const USER_ID = '7c0b6a52-3b7e-4d55-9a4e-0c9f2b6d1e11';

const wallet = (overrides: Partial<HepaidWallet> = {}): HepaidWallet => ({
  id: 'wal_1',
  reference: `ps-${USER_ID}`,
  mode: 'Test',
  status: 'Active',
  currency: 'NGN',
  customer: { id: 'c1', email: 'paul@paysplit.com', name: null, externalId: USER_ID, phone: null },
  fundingAccount: {
    accountName: 'PAUL ADEYEMI',
    accounts: [
      {
        bankCode: '035',
        bankName: 'Wema Bank',
        accountNumber: '7810000001',
        accountName: 'PAUL ADEYEMI',
      },
    ],
    identityType: 'Bvn',
    gateway: 'test',
  },
  balance: { available: 0, inTransit: 0 },
  metadata: null,
  failureReason: null,
  createdAt: '2026-11-10T09:00:00Z',
  closedAt: null,
  link: null,
  ...overrides,
});

function setup(options: { record?: Record<string, unknown> | null } = {}) {
  const record = {
    userId: USER_ID,
    providerReference: `ps-${USER_ID}`,
    providerWalletId: null,
    status: 'pending',
    attempts: 0,
    retryCount: 0,
    activatedAt: null,
    failureReason: null as string | null,
    accounts: [],
    ...options.record,
    update: jest.fn(function (this: Record<string, unknown>, changes: Record<string, unknown>) {
      Object.assign(this, changes);
      return Promise.resolve(this);
    }),
  };
  const accounts = {
    findOne: jest.fn().mockResolvedValue(options.record === null ? null : record),
    create: jest.fn().mockResolvedValue(record),
  };
  const verifications = {
    findOne: jest.fn().mockResolvedValue({
      method: 'bvn',
      idNumberEncrypted: 'enc',
      legalFirstName: 'PAUL',
      legalLastName: 'ADEYEMI',
    }),
  };
  const hepaid = {
    isConfigured: true,
    createWallet: jest.fn().mockResolvedValue(wallet()),
    getWallet: jest.fn().mockResolvedValue(wallet()),
  };
  const users = {
    findById: jest.fn().mockResolvedValue({
      id: USER_ID,
      email: 'paul@paysplit.com',
      firstName: 'Paul',
      lastName: 'Adeyemi',
      kycStatus: 'approved',
    }),
  };
  const crypto = { decrypt: jest.fn().mockReturnValue('22222222222') };
  const ledger = { getOrCreateSalaryAccount: jest.fn().mockResolvedValue({ id: 'la1' }) };
  const notifications = { notify: jest.fn().mockResolvedValue(undefined) };

  const service = new SalaryAccountProvisioningService(
    {} as never,
    accounts as never,
    verifications as never,
    hepaid as never,
    users as never,
    crypto as never,
    ledger as never,
    notifications as never,
  );
  return { service, record, accounts, verifications, hepaid, users, ledger, notifications };
}

describe('SalaryAccountProvisioningService', () => {
  it('creates the HePaid wallet with the verified name and decrypted BVN, then activates', async () => {
    const { service, record, hepaid, ledger, notifications } = setup({ record: null });

    const result = await service.provision(USER_ID);

    expect(hepaid.createWallet).toHaveBeenCalledWith({
      reference: `ps-${USER_ID}`,
      customer: { email: 'paul@paysplit.com', externalId: USER_ID, name: 'PAUL ADEYEMI' },
      identity: { type: 'Bvn', number: '22222222222' },
      accountName: 'PAUL ADEYEMI',
      metadata: { userId: USER_ID },
    });
    expect(result?.status).toBe('active');
    expect(record.accounts).toEqual([
      {
        bankCode: '035',
        bankName: 'Wema Bank',
        accountNumber: '7810000001',
        accountName: 'PAUL ADEYEMI',
      },
    ]);
    expect(ledger.getOrCreateSalaryAccount).toHaveBeenCalledWith(USER_ID);
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ id: USER_ID }),
      expect.objectContaining({ type: 'salary_account_issued', email: true }),
    );
  });

  it('skips users whose KYC is not approved', async () => {
    const { service, users, hepaid } = setup();
    users.findById.mockResolvedValue({ id: USER_ID, kycStatus: 'pending' });
    expect(await service.provision(USER_ID)).toBeNull();
    expect(hepaid.createWallet).not.toHaveBeenCalled();
  });

  it('returns an active account without calling HePaid', async () => {
    const { service, hepaid } = setup({ record: { status: 'active' } });
    expect((await service.provision(USER_ID))?.status).toBe('active');
    expect(hepaid.createWallet).not.toHaveBeenCalled();
  });

  it('keeps the same reference and stays pending when HePaid is unavailable', async () => {
    const { service, record, hepaid } = setup();
    hepaid.createWallet.mockRejectedValue(new HepaidError(503, 'http_503', 'down'));

    await service.provision(USER_ID);

    expect(record.status).toBe('pending');
    expect(record.retryCount).toBe(1);
    expect(record.providerReference).toBe(`ps-${USER_ID}`);
  });

  it('gives up after repeated provider failures', async () => {
    const { service, record, hepaid } = setup({
      record: { retryCount: MAX_PROVIDER_RETRIES - 1 },
    });
    hepaid.createWallet.mockRejectedValue(new HepaidError(0, 'network_error', 'timeout'));
    await service.provision(USER_ID);
    expect(record.status).toBe('failed');
  });

  it('marks the account failed when HePaid rejects the request', async () => {
    const { service, record, hepaid } = setup();
    hepaid.createWallet.mockRejectedValue(new HepaidError(400, 'validation_error', 'bad BVN'));
    await service.provision(USER_ID);
    expect(record.status).toBe('failed');
    expect(record.failureReason).toBe('validation_error: bad BVN');
  });

  it('retries a Failed wallet with a new reference', async () => {
    const { service, record, hepaid } = setup();
    hepaid.createWallet.mockResolvedValue(
      wallet({ status: 'Failed', failureReason: 'gateway', fundingAccount: null }),
    );

    await service.provision(USER_ID);

    expect(record.status).toBe('pending');
    expect(record.attempts).toBe(1);
    expect(record.providerReference).toBe(`ps-${USER_ID}-2`);
    expect(record.providerWalletId).toBeNull();
  });

  it('checks on a wallet that was created but not yet active', async () => {
    const { service, hepaid } = setup({ record: { providerWalletId: 'wal_1' } });
    await service.provision(USER_ID);
    expect(hepaid.getWallet).toHaveBeenCalledWith(`ps-${USER_ID}`);
    expect(hepaid.createWallet).not.toHaveBeenCalled();
  });

  it('retries a not-eligible account with a new reference once a BVN/NIN is added', async () => {
    const { service, record, verifications, hepaid } = setup({
      record: { status: 'not_eligible', attempts: 0, failureReason: 'no BVN' },
    });
    verifications.findOne.mockResolvedValue({
      method: 'passport',
      idNumberEncrypted: 'enc-passport',
      walletIdMethod: 'nin',
      walletIdEncrypted: 'enc',
      legalFirstName: 'PAUL',
      legalLastName: 'ADEYEMI',
    });

    const result = await service.retryWithNewIdentity(USER_ID);

    expect(record.providerReference).toBe(`ps-${USER_ID}-2`);
    expect(hepaid.createWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: `ps-${USER_ID}-2`,
        identity: { type: 'Nin', number: '22222222222' },
      }),
    );
    expect(result?.status).toBe('active');
  });

  it('marks users without a BVN/NIN not eligible, without calling HePaid', async () => {
    const { service, record, verifications, hepaid } = setup();
    verifications.findOne.mockResolvedValue({ method: 'passport', idNumberEncrypted: 'enc' });
    const result = await service.provision(USER_ID);
    expect(result?.status).toBe('not_eligible');
    expect(record.failureReason).toContain('BVN or NIN');
    expect(hepaid.createWallet).not.toHaveBeenCalled();
  });

  it('keeps the account pending while HePaid reports the request in progress', async () => {
    const { service, record, hepaid } = setup();
    hepaid.createWallet.mockRejectedValue(
      new HepaidError(409, 'idempotency_in_progress', 'still processing'),
    );
    await service.provision(USER_ID);
    expect(record.status).toBe('pending');
    expect(record.retryCount).toBe(1);
  });

  it('adopts the existing wallet when HePaid says the reference already exists', async () => {
    const { service, record, hepaid } = setup();
    hepaid.createWallet.mockRejectedValue(new HepaidError(409, 'duplicate_reference', 'exists'));
    await service.provision(USER_ID);
    expect(hepaid.getWallet).toHaveBeenCalledWith(`ps-${USER_ID}`);
    expect(record.status).toBe('active');
  });
});

describe('SalaryAccountProvisioningService.walletIdentity', () => {
  it('prefers a BVN/NIN added for the salary account over the KYC method', () => {
    expect(
      SalaryAccountProvisioningService.walletIdentity({
        method: 'passport',
        idNumberEncrypted: 'passport-enc',
        walletIdMethod: 'nin',
        walletIdEncrypted: 'nin-enc',
      } as never),
    ).toEqual({ method: 'nin', encrypted: 'nin-enc' });
  });

  it('falls back to the KYC BVN/NIN, and has none for a passport alone', () => {
    expect(
      SalaryAccountProvisioningService.walletIdentity({
        method: 'bvn',
        idNumberEncrypted: 'bvn-enc',
      } as never),
    ).toEqual({ method: 'bvn', encrypted: 'bvn-enc' });
    expect(
      SalaryAccountProvisioningService.walletIdentity({
        method: 'passport',
        idNumberEncrypted: 'passport-enc',
      } as never),
    ).toBeNull();
    expect(
      SalaryAccountProvisioningService.walletIdentity({
        method: 'nin',
        idNumberEncrypted: null,
      } as never),
    ).toBeNull();
  });
});

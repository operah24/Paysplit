import { Transaction } from 'sequelize';
import { InsufficientFundsError, LedgerService } from './ledger.service';
import { LedgerAccount } from '../entities/ledger-account.entity';
import { LedgerTransaction } from '../entities/ledger-transaction.entity';
import { LedgerEntry } from '../entities/ledger-entry.entity';

type FakeAccount = { id: string; type: string; balance: number; update: jest.Mock };

const account = (id: string, type: string, balance: number): FakeAccount => {
  const acc: FakeAccount = {
    id,
    type,
    balance,
    update: jest.fn((values: { balance: number }) => {
      acc.balance = values.balance;
      return Promise.resolve(acc);
    }),
  };
  return acc;
};

describe('LedgerService', () => {
  const t = { LOCK: { UPDATE: 'UPDATE' } } as unknown as Transaction;
  let accounts: FakeAccount[];
  let txCreate: jest.Mock;
  let entriesCreate: jest.Mock;
  let service: LedgerService;

  beforeEach(() => {
    accounts = [account('a-salary', 'salary', 10_000), account('b-wallet', 'wallet', 0)];
    txCreate = jest.fn((data: Record<string, unknown>) => Promise.resolve({ id: 'tx-1', ...data }));
    entriesCreate = jest.fn().mockResolvedValue([]);
    service = new LedgerService(
      {} as never,
      {
        findAll: jest.fn(({ where }: { where: { id: string[] } }) =>
          Promise.resolve(accounts.filter((a) => where.id.includes(a.id))),
        ),
      } as unknown as typeof LedgerAccount,
      { create: txCreate } as unknown as typeof LedgerTransaction,
      { bulkCreate: entriesCreate } as unknown as typeof LedgerEntry,
    );
  });

  it('posts balanced legs, updates balances and records balance-after per entry', async () => {
    await service.post(
      {
        userId: 'u1',
        type: 'wallet_allocation',
        amount: 4_000,
        walletId: 'w1',
        legs: [
          { accountId: 'a-salary', amount: -4_000 },
          { accountId: 'b-wallet', amount: 4_000 },
        ],
      },
      t,
    );

    expect(accounts[0].balance).toBe(6_000);
    expect(accounts[1].balance).toBe(4_000);
    expect(txCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'wallet_allocation',
        status: 'success',
        amount: 4_000,
        walletId: 'w1',
        reference: expect.stringMatching(/^PAY-\d{8}-[A-Z2-9]{6}$/) as unknown,
      }),
      { transaction: t },
    );
    const entries = (entriesCreate.mock.calls[0] as [Record<string, number>[]])[0];
    expect(entries.map((e) => [e.amount, e.balanceAfter])).toEqual([
      [-4_000, 6_000],
      [4_000, 4_000],
    ]);
  });

  it('refuses to take a user account below zero', async () => {
    await expect(
      service.post(
        {
          userId: 'u1',
          type: 'wallet_withdrawal',
          amount: 1,
          legs: [
            { accountId: 'b-wallet', amount: -1 },
            { accountId: 'a-salary', amount: 1 },
          ],
        },
        t,
      ),
    ).rejects.toBeInstanceOf(InsufficientFundsError);
    expect(txCreate).not.toHaveBeenCalled();
    expect(accounts[1].balance).toBe(0);
  });

  it('lets system accounts go negative', async () => {
    accounts.push(account('c-inflow', 'system', 0));
    await service.post(
      {
        userId: 'u1',
        type: 'salary_credit',
        amount: 500,
        legs: [
          { accountId: 'c-inflow', amount: -500 },
          { accountId: 'a-salary', amount: 500 },
        ],
      },
      t,
    );
    expect(accounts[2].balance).toBe(-500);
  });

  it('rejects unbalanced or degenerate legs', () => {
    expect(() =>
      LedgerService.assertBalanced([
        { accountId: 'a', amount: -5 },
        { accountId: 'b', amount: 4 },
      ]),
    ).toThrow(/sum to zero/);
    expect(() => LedgerService.assertBalanced([{ accountId: 'a', amount: 5 }])).toThrow(/two legs/);
    expect(() =>
      LedgerService.assertBalanced([
        { accountId: 'a', amount: 0.5 },
        { accountId: 'b', amount: -0.5 },
      ]),
    ).toThrow(/integer/);
  });

  it('generates references with the Lagos date', () => {
    expect(LedgerService.generateReference(new Date('2026-10-24T23:30:00Z'))).toMatch(
      /^PAY-20261025-[A-Z2-9]{6}$/,
    );
  });
});

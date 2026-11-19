import { TransactionsService } from './transactions.service';
import { TransactionQueryService } from '../../ledger/services/transaction-query.service';

describe('TransactionsService', () => {
  it('maps tabs, direction and Lagos dates to a ledger filter', () => {
    const filter = TransactionsService.toFilter({
      type: 'wallet',
      direction: 'out',
      from: '2026-11-01',
      to: '2026-11-05',
    });
    expect(filter.types).toEqual(['wallet_allocation']);
    expect(filter.from?.toISOString()).toBe('2026-10-31T23:00:00.000Z');
    expect(filter.to?.toISOString()).toBe('2026-11-05T23:00:00.000Z');
  });

  it('rejects an inverted date range', () => {
    expect(() => TransactionsService.toFilter({ from: '2026-11-05', to: '2026-11-01' })).toThrow();
  });

  it('quotes CSV cells and neutralises formula injection but keeps negative amounts', () => {
    expect(TransactionsService.csvCell('Plain')).toBe('"Plain"');
    expect(TransactionsService.csvCell('Say "hi"')).toBe('"Say ""hi"""');
    expect(TransactionsService.csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(TransactionsService.csvCell('-850,000.00')).toBe('"-850,000.00"');
  });

  it('exports a statement with a header and signed amounts', async () => {
    const query = {
      listForExport: jest.fn().mockResolvedValue([
        {
          reference: 'PAY-20261121-ABC234',
          createdAt: new Date('2026-11-21T11:00:00Z'),
          type: 'wallet_allocation',
          title: 'Dec Trip Fund Wallet',
          destination: { type: 'wallet', id: 'w1', name: 'Dec Trip Fund' },
          category: { id: 'c', name: 'Savings', slug: 'savings' },
          status: 'success',
          direction: 'out',
          amount: 85_000_000,
          fee: 0,
          narration: null,
        },
      ]),
    } as unknown as TransactionQueryService;

    const csv = await new TransactionsService(query).exportCsv('u1', {});
    const [header, row] = csv.slice(1).trim().split('\r\n');

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(header.startsWith('Reference,Date (WAT),Type')).toBe(true);
    expect(row).toBe(
      '"PAY-20261121-ABC234","2026-11-21 12:00","Split to wallet","Dec Trip Fund Wallet","Dec Trip Fund","Savings","success","out","-850,000.00","0.00",""',
    );
  });
});

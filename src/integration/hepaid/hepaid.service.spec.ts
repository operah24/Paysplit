import { ConfigService } from '@nestjs/config';
import { HepaidService } from './hepaid.service';
import { HepaidError } from './hepaid.error';

const config = (values: Record<string, unknown>) =>
  ({
    get: (key: string, fallback?: unknown) => (key in values ? values[key] : fallback),
  }) as unknown as ConfigService;

const ok = (data: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify({ success: true, data, error: null }), { status }));
const fail = (status: number, code: string, message = 'nope') =>
  Promise.resolve(
    new Response(
      JSON.stringify({ success: false, data: null, error: { code, message, details: null } }),
      {
        status,
      },
    ),
  );

describe('HepaidService', () => {
  let fetchMock: jest.SpyInstance;
  let service: HepaidService;

  const call = (index = 0) => {
    const [url, init] = fetchMock.mock.calls[index] as [URL, RequestInit];
    return { url: url.toString(), init, headers: init.headers as Record<string, string> };
  };

  beforeEach(() => {
    jest.useRealTimers();
    fetchMock = jest.spyOn(global, 'fetch');
    service = new HepaidService(
      config({ 'hepaid.baseUrl': 'https://hepaid.test/v1/', 'hepaid.secretKey': 'hp_test_sk_x' }),
    );
  });

  afterEach(() => fetchMock.mockRestore());

  it('sends a bearer secret key and query parameters on GET', async () => {
    fetchMock.mockReturnValueOnce(
      ok({
        bankCode: '058',
        accountNumber: '0123456789',
        accountName: 'ALI DABBS',
        bankName: null,
      }),
    );
    const result = await service.resolveAccount('058', '0123456789');

    expect(result.accountName).toBe('ALI DABBS');
    const { url, init, headers } = call();
    expect(url).toBe(
      'https://hepaid.test/v1/banks/resolve?currency=NGN&bankCode=058&accountNumber=0123456789',
    );
    expect(init.method).toBe('GET');
    expect(headers.Authorization).toBe('Bearer hp_test_sk_x');
    expect(headers['Idempotency-Key']).toBeUndefined();
  });

  it('always sends a JSON body and an idempotency key on POST', async () => {
    fetchMock.mockReturnValueOnce(ok({ id: 't1', reference: 'ref-1', status: 'Pending' }));
    await service.createTransfer({
      reference: 'ref-1',
      amount: 150000,
      narration: 'Rent',
      recipient: { bankCode: '058', accountNumber: '0123456789', accountName: 'ALI DABBS' },
    });

    const { init, headers } = call();
    expect(headers['Idempotency-Key']).toBe('transfer:ref-1');
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toMatchObject({ currency: 'NGN', amount: 150000 });
  });

  it('raises HepaidError with HePaid’s error code', async () => {
    fetchMock.mockReturnValueOnce(
      fail(422, 'invalid_recipient', 'Invalid account details supplied'),
    );
    await expect(service.resolveAccount('058', '0000000000')).rejects.toMatchObject({
      status: 422,
      code: 'invalid_recipient',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries once on a 5xx, reusing the same idempotency key', async () => {
    fetchMock
      .mockReturnValueOnce(fail(502, 'gateway_unavailable'))
      .mockReturnValueOnce(ok({ id: 'w1', reference: 'u1', status: 'Active' }));

    const wallet = await service.createWallet({
      reference: 'u1',
      customer: { email: 'a@b.c', externalId: 'u1' },
    });

    expect(wallet.status).toBe('Active');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(call(0).headers['Idempotency-Key']).toBe(call(1).headers['Idempotency-Key']);
  });

  it('caches the bank list and trims names', async () => {
    fetchMock.mockReturnValueOnce(
      ok([
        { code: '058', name: 'GTBANK ' },
        { code: '044', name: 'ACCESS BANK' },
      ]),
    );
    const first = await service.listBanks();
    const second = await service.listBanks();

    expect(first).toEqual([
      { code: '044', name: 'ACCESS BANK' },
      { code: '058', name: 'GTBANK' },
    ]);
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails fast without a secret key', async () => {
    const unconfigured = new HepaidService(config({}));
    await expect(unconfigured.listBanks()).rejects.toBeInstanceOf(HepaidError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats HTML error pages as HTTP errors', async () => {
    fetchMock.mockReturnValue(Promise.resolve(new Response('<html>411</html>', { status: 411 })));
    await expect(service.getBalances()).rejects.toMatchObject({ status: 411, code: 'http_411' });
  });
});

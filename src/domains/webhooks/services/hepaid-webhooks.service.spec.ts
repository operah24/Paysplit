import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HepaidWebhooksService } from './hepaid-webhooks.service';
import { signHepaidPayload } from '../utils/hepaid-signature';

const SECRET = 'whsec_unit_test';

const signed = (event: Record<string, unknown>) => {
  const raw = JSON.stringify(event);
  return {
    raw: Buffer.from(raw),
    header: signHepaidPayload(raw, SECRET, Math.floor(Date.now() / 1000)),
  };
};

function setup(secret = SECRET) {
  const record = {
    id: 'r1',
    status: 'received',
    attempts: 0,
    update: jest.fn(function (this: Record<string, unknown>, changes: Record<string, unknown>) {
      Object.assign(this, changes);
      return Promise.resolve(this);
    }),
  };
  const events = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(record),
  };
  const credits = { syncWallet: jest.fn().mockResolvedValue(1) };
  const payouts = { syncByReference: jest.fn().mockResolvedValue(true) };
  const service = new HepaidWebhooksService(
    { get: () => secret } as unknown as ConfigService,
    credits as never,
    payouts as never,
    events as never,
  );
  return { service, record, events, credits, payouts };
}

const event = (type: string, data: unknown = {}) => ({
  id: `evt_${type}`,
  type,
  createdAt: '2026-11-10T10:00:00+00:00',
  mode: 'Test',
  data,
});

describe('HepaidWebhooksService', () => {
  it('records a correctly signed event', async () => {
    const { service, events } = setup();
    const { raw, header } = signed(event('ping'));
    const result = await service.receive(raw, header);
    expect(result.duplicate).toBe(false);
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'hepaid', eventId: 'evt_ping', type: 'ping' }),
    );
  });

  it('rejects a bad signature with 400 and stores nothing', async () => {
    const { service, events } = setup();
    const { raw } = signed(event('ping'));
    await expect(service.receive(raw, 't=1,v1=00')).rejects.toBeInstanceOf(BadRequestException);
    expect(events.create).not.toHaveBeenCalled();
  });

  it('answers 503 until HEPAID_WEBHOOK_SECRET is set, so HePaid retries', async () => {
    const { service } = setup('');
    const { raw, header } = signed(event('ping'));
    await expect(service.receive(raw, header)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('treats a repeated event id as a duplicate, but retries a failed one', async () => {
    const { service, events } = setup();
    const { raw, header } = signed(event('ping'));
    events.findOne.mockResolvedValueOnce({ status: 'processed' });
    expect((await service.receive(raw, header)).duplicate).toBe(true);
    events.findOne.mockResolvedValueOnce({ status: 'failed' });
    expect((await service.receive(raw, header)).duplicate).toBe(false);
  });

  it('wallet.credited syncs that wallet from HePaid', async () => {
    const { service, record, credits } = setup();
    await service.process(
      event('wallet.credited', {
        transaction: { id: 't' },
        wallet: { reference: 'ps-u1' },
      }) as never,
      record as never,
    );
    expect(credits.syncWallet).toHaveBeenCalledWith('ps-u1');
    expect(record.status).toBe('processed');
  });

  it('transfer events re-read the transfer by our reference', async () => {
    const { service, record, payouts } = setup();
    await service.process(
      event('transfer.reversed', { reference: 'PAY-20261110-ABCDEF', status: 'Reversed' }) as never,
      record as never,
    );
    expect(payouts.syncByReference).toHaveBeenCalledWith('PAY-20261110-ABCDEF');
    expect(record.status).toBe('processed');
  });

  it('ignores ping, unknown wallets and unused event types', async () => {
    const { service, record, credits } = setup();
    await service.process(event('ping') as never, record as never);
    expect(record.status).toBe('ignored');

    credits.syncWallet.mockResolvedValueOnce(null);
    await service.process(
      event('wallet.credited', { wallet: { reference: 'someone-else' } }) as never,
      record as never,
    );
    expect(record.status).toBe('ignored');

    await service.process(event('payment.succeeded') as never, record as never);
    expect(record.status).toBe('ignored');
  });

  it('marks the event failed (never throws) when processing errors', async () => {
    const { service, record, payouts } = setup();
    payouts.syncByReference.mockRejectedValueOnce(new Error('HePaid down'));
    await service.process(
      event('transfer.succeeded', { reference: 'PAY-1' }) as never,
      record as never,
    );
    expect(record.status).toBe('failed');
    expect(record.attempts).toBe(1);
  });
});

import { requestMetaFrom } from './request-meta.decorator';

describe('requestMetaFrom', () => {
  it('takes the first X-Forwarded-For hop', () => {
    expect(
      requestMetaFrom({
        ip: '10.0.0.1',
        headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': 'Chrome' },
      }),
    ).toEqual({ ip: '203.0.113.7', userAgent: 'Chrome' });
  });

  it('falls back to the socket IP and handles a missing user agent', () => {
    expect(requestMetaFrom({ ip: '10.0.0.1', headers: {} })).toEqual({
      ip: '10.0.0.1',
      userAgent: null,
    });
  });

  it('truncates long user agents', () => {
    const meta = requestMetaFrom({ headers: { 'user-agent': 'x'.repeat(600) } });
    expect(meta.userAgent).toHaveLength(512);
    expect(meta.ip).toBeNull();
  });
});

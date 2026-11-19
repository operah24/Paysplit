import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { KycCryptoService } from './kyc-crypto.service';

const make = (key: string) =>
  new KycCryptoService({ getOrThrow: () => key } as unknown as ConfigService);

describe('KycCryptoService', () => {
  const service = make(randomBytes(32).toString('base64'));

  it('round-trips and never produces the plaintext', () => {
    const encrypted = service.encrypt('22222222222');
    expect(encrypted).not.toContain('22222222222');
    expect(service.decrypt(encrypted)).toBe('22222222222');
  });

  it('uses a fresh IV each time', () => {
    expect(service.encrypt('22222222222')).not.toBe(service.encrypt('22222222222'));
  });

  it('rejects tampered ciphertext', () => {
    const data = Buffer.from(service.encrypt('22222222222'), 'base64');
    data[data.length - 1] ^= 0xff;
    expect(() => service.decrypt(data.toString('base64'))).toThrow();
  });

  it('produces stable fingerprints scoped by ID type', () => {
    expect(service.fingerprint('bvn', '22222222222')).toBe(
      service.fingerprint('bvn', ' 22222222222 '),
    );
    expect(service.fingerprint('bvn', '22222222222')).not.toBe(
      service.fingerprint('nin', '22222222222'),
    );
  });

  it('refuses a key that is not 32 bytes', () => {
    expect(() => make(randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
  });
});

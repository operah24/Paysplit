import { isDojahSandboxUrl } from './dojah.sandbox';
import { validationSchema } from '../../config/validation.schema';

describe('isDojahSandboxUrl', () => {
  it.each([
    ['https://sandbox.dojah.io', true],
    ['https://SANDBOX.dojah.io/', true],
    ['https://api.dojah.io', false],
    ['https://sandbox.dojah.io.evil.com', false],
    ['not a url', false],
    ['', false],
    [undefined, false],
  ])('%s -> %s', (url, expected) => {
    expect(isDojahSandboxUrl(url)).toBe(expected);
  });
});

describe('DOJAH_BASE_URL validation', () => {
  const base = {
    DB_HOST: 'localhost',
    DB_USERNAME: 'u',
    DB_PASSWORD: 'p',
    DB_NAME: 'd',
    KYC_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
    JWT_SECRET: 'x'.repeat(32),
  };
  const validate = (env: Record<string, string>) =>
    validationSchema.validate({ ...base, ...env }, { allowUnknown: true });

  it('refuses the sandbox URL in production', () => {
    const { error } = validate({
      NODE_ENV: 'production',
      DOJAH_BASE_URL: 'https://sandbox.dojah.io',
    });
    expect(error?.message).toContain('must not point at the Dojah sandbox');
  });

  it('requires an explicit URL in production', () => {
    const { error } = validate({ NODE_ENV: 'production' });
    expect(error?.message).toContain('DOJAH_BASE_URL');
  });

  it('accepts the live URL in production', () => {
    const { error } = validate({ NODE_ENV: 'production', DOJAH_BASE_URL: 'https://api.dojah.io' });
    expect(error).toBeUndefined();
  });

  it('defaults to the sandbox outside production', () => {
    const result = validate({ NODE_ENV: 'staging' });
    const value = result.value as Record<string, unknown>;
    expect(result.error).toBeUndefined();
    expect(value.DOJAH_BASE_URL).toBe('https://sandbox.dojah.io');
  });
});

import { validationSchema } from './validation.schema';

const BASE = {
  DB_HOST: 'localhost',
  DB_USERNAME: 'user',
  DB_PASSWORD: 'pass',
  DB_NAME: 'db',
  JWT_SECRET: 'x'.repeat(40),
  KYC_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
};

type ValidatedEnv = { DOJAH_BASE_URL: string; ALLOW_DOJAH_SANDBOX: boolean };

const validate = (env: Record<string, string>) => {
  const result = validationSchema.validate({ ...BASE, ...env }, { allowUnknown: true });
  return { error: result.error, value: result.value as ValidatedEnv };
};

describe('validationSchema: DOJAH_BASE_URL', () => {
  it('defaults to the sandbox outside production', () => {
    const { error, value } = validate({ NODE_ENV: 'development' });
    expect(error).toBeUndefined();
    expect(value.DOJAH_BASE_URL).toBe('https://sandbox.dojah.io');
    expect(value.ALLOW_DOJAH_SANDBOX).toBe(false);
  });

  it('accepts the live URL in production', () => {
    const { error } = validate({ NODE_ENV: 'production', DOJAH_BASE_URL: 'https://api.dojah.io' });
    expect(error).toBeUndefined();
  });

  it('rejects the sandbox URL in production by default', () => {
    const { error } = validate({
      NODE_ENV: 'production',
      DOJAH_BASE_URL: 'https://sandbox.dojah.io',
    });
    expect(error?.message).toContain('must not point at the Dojah sandbox');
  });

  it('requires DOJAH_BASE_URL in production', () => {
    const { error } = validate({ NODE_ENV: 'production' });
    expect(error?.message).toContain('"DOJAH_BASE_URL" is required');
  });

  it('allows the sandbox URL in production when ALLOW_DOJAH_SANDBOX=true', () => {
    const { error, value } = validate({
      NODE_ENV: 'production',
      DOJAH_BASE_URL: 'https://sandbox.dojah.io',
      ALLOW_DOJAH_SANDBOX: 'true',
    });
    expect(error).toBeUndefined();
    expect(value.ALLOW_DOJAH_SANDBOX).toBe(true);
  });

  it('still rejects the sandbox URL when ALLOW_DOJAH_SANDBOX=false', () => {
    const { error } = validate({
      NODE_ENV: 'production',
      DOJAH_BASE_URL: 'https://sandbox.dojah.io',
      ALLOW_DOJAH_SANDBOX: 'false',
    });
    expect(error?.message).toContain('must not point at the Dojah sandbox');
  });

  it('still requires DOJAH_BASE_URL in production when the sandbox is allowed', () => {
    const { error } = validate({ NODE_ENV: 'production', ALLOW_DOJAH_SANDBOX: 'true' });
    expect(error?.message).toContain('"DOJAH_BASE_URL" is required');
  });

  it('rejects a non-boolean ALLOW_DOJAH_SANDBOX', () => {
    const { error } = validate({
      NODE_ENV: 'production',
      DOJAH_BASE_URL: 'https://api.dojah.io',
      ALLOW_DOJAH_SANDBOX: 'yes please',
    });
    expect(error?.message).toContain('"ALLOW_DOJAH_SANDBOX" must be a boolean');
  });
});

describe('validationSchema: HEPAID_SECRET_KEY', () => {
  const PROD = { NODE_ENV: 'production', DOJAH_BASE_URL: 'https://api.dojah.io' };
  const TEST_KEY = 'hp_test_sk_example';

  it('accepts a test key outside production', () => {
    expect(
      validate({ NODE_ENV: 'development', HEPAID_SECRET_KEY: TEST_KEY }).error,
    ).toBeUndefined();
  });

  it('accepts a live key in production', () => {
    expect(validate({ ...PROD, HEPAID_SECRET_KEY: 'hp_live_sk_example' }).error).toBeUndefined();
  });

  it('rejects a test key in production by default', () => {
    const { error } = validate({ ...PROD, HEPAID_SECRET_KEY: TEST_KEY });
    expect(error?.message).toContain('must be a live secret key');
  });

  it('allows a test key in production when ALLOW_HEPAID_TEST_KEY=true', () => {
    const { error } = validate({
      ...PROD,
      HEPAID_SECRET_KEY: TEST_KEY,
      ALLOW_HEPAID_TEST_KEY: 'true',
    });
    expect(error).toBeUndefined();
  });

  it('still rejects a malformed key when test keys are allowed', () => {
    const { error } = validate({
      ...PROD,
      HEPAID_SECRET_KEY: 'sk_abc',
      ALLOW_HEPAID_TEST_KEY: 'true',
    });
    expect(error?.message).toContain('must be a HePaid secret key');
  });
});

describe('validationSchema: PAYMENTS_SIMULATION', () => {
  const PROD = { NODE_ENV: 'production', DOJAH_BASE_URL: 'https://api.dojah.io' };

  it('is off by default and allowed outside production', () => {
    expect(validate({ NODE_ENV: 'development' }).error).toBeUndefined();
    expect(
      validate({ NODE_ENV: 'development', PAYMENTS_SIMULATION: 'true' }).error,
    ).toBeUndefined();
  });

  it('is refused in production', () => {
    const { error } = validate({ ...PROD, PAYMENTS_SIMULATION: 'true' });
    expect(error?.message).toContain('PAYMENTS_SIMULATION must be false');
  });

  it('is allowed on a dev deployment (ALLOW_HEPAID_TEST_KEY=true)', () => {
    const { error } = validate({
      ...PROD,
      PAYMENTS_SIMULATION: 'true',
      ALLOW_HEPAID_TEST_KEY: 'true',
    });
    expect(error).toBeUndefined();
  });

  it('requires a long JOBS_SECRET when set', () => {
    const { error } = validate({ NODE_ENV: 'development', JOBS_SECRET: 'short' });
    expect(error?.message).toContain('"JOBS_SECRET" length must be at least 32');
  });
});

describe('validationSchema: HEPAID_WEBHOOK_SECRET', () => {
  it('is optional and must be a whsec_ secret when set', () => {
    expect(validate({ NODE_ENV: 'development' }).error).toBeUndefined();
    expect(
      validate({ NODE_ENV: 'development', HEPAID_WEBHOOK_SECRET: 'whsec_abc' }).error,
    ).toBeUndefined();
    expect(
      validate({ NODE_ENV: 'development', HEPAID_WEBHOOK_SECRET: 'abc' }).error?.message,
    ).toContain('whsec_');
  });
});

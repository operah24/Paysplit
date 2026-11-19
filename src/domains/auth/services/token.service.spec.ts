import { ConfigService } from '@nestjs/config';
import { TokenService } from './token.service';

const config: Record<string, string> = {
  'jwt.secret': 'test-secret-that-is-long-enough-123456',
  'jwt.expiresIn': '24h',
  'jwt.rememberMeExpiresIn': '30d',
  'jwt.setupTokenExpiresIn': '15m',
};

describe('TokenService', () => {
  const service = new TokenService({
    get: (key: string) => config[key],
    getOrThrow: (key: string) => config[key],
  } as unknown as ConfigService);
  const user = { id: 'user-1', email: 'paul@paysplit.com' };

  it('issues a 24h access token by default', () => {
    const { token, expiresIn } = service.signAccessToken(user);
    expect(expiresIn).toBe(24 * 60 * 60);
    expect(service.verify(token, 'access')).toMatchObject({ id: 'user-1', purpose: 'access' });
  });

  it('issues a 30-day access token with rememberMe', () => {
    expect(service.signAccessToken(user, true).expiresIn).toBe(30 * 24 * 60 * 60);
  });

  it('issues a 15-minute setup token', () => {
    expect(service.signPasswordSetupToken(user).expiresIn).toBe(15 * 60);
  });

  it('does not accept a setup token as an access token, or vice versa', () => {
    const setup = service.signPasswordSetupToken(user).token;
    const access = service.signAccessToken(user).token;
    expect(service.verify(setup, 'access')).toBeNull();
    expect(service.verify(access, 'password_setup')).toBeNull();
  });

  it('rejects a tampered token', () => {
    const { token } = service.signAccessToken(user);
    expect(service.verify(`${token}x`, 'access')).toBeNull();
  });
});

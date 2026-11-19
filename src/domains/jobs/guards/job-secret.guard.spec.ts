import { NotFoundException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobSecretGuard } from './job-secret.guard';

const SECRET = 's'.repeat(40);

const context = (header?: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        header: (name: string) => (name === 'x-job-secret' ? header : undefined),
      }),
    }),
  }) as unknown as ExecutionContext;

const guard = (secret: string) =>
  new JobSecretGuard({ get: () => secret } as unknown as ConfigService);

describe('JobSecretGuard', () => {
  it('allows the configured secret', () => {
    expect(guard(SECRET).canActivate(context(SECRET))).toBe(true);
  });

  it('answers 404 for a wrong or missing secret', () => {
    expect(() => guard(SECRET).canActivate(context('nope'))).toThrow(NotFoundException);
    expect(() => guard(SECRET).canActivate(context())).toThrow(NotFoundException);
  });

  it('is closed when JOBS_SECRET is not set', () => {
    expect(() => guard('').canActivate(context(''))).toThrow(NotFoundException);
  });
});

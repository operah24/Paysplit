import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

const contextFor = (user: unknown): ExecutionContext =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<Reflector>;
  const guard = new RolesGuard(reflector);

  beforeEach(() => reflector.getAllAndOverride.mockReturnValue(['admin', 'super_admin']));

  it.each(['admin', 'super_admin'])('lets %s through', (name) => {
    expect(guard.canActivate(contextFor({ role: { name } }))).toBe(true);
  });

  it('accepts the role as a plain string', () => {
    expect(guard.canActivate(contextFor({ role: 'admin' }))).toBe(true);
  });

  it.each(['user', 'owner', 'Owner'])('rejects %s', (name) => {
    expect(() => guard.canActivate(contextFor({ role: { name } }))).toThrow(ForbiddenException);
  });

  it('rejects a user without a role, or no user at all', () => {
    expect(() => guard.canActivate(contextFor({}))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException);
  });

  it('allows routes without @Roles()', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(contextFor({ role: { name: 'user' } }))).toBe(true);
  });
});

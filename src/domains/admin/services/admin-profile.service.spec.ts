import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/services/users.service';
import { AdminAuditService } from '../../audit/services/admin-audit.service';
import { ADMIN_AUDIT_ACTIONS } from '../../audit/constants/audit.constants';
import { AdminProfileService } from './admin-profile.service';
import { ADMIN_ERROR_CODES } from './admin-users.service';

const META = { ip: '203.0.113.7', userAgent: 'jest' };

const makeAdmin = (overrides: Record<string, unknown> = {}): User =>
  ({
    id: 'admin-1',
    firstName: 'Marcus',
    lastName: 'Vance',
    email: 'marcus@paysplit.test',
    phoneNumber: '+2348031234567',
    countryCode: null,
    profileImageUrl: null,
    role: { name: 'super_admin' },
    createdAt: new Date('2026-11-01T00:00:00Z'),
    lastLoginAt: null,
    passwordSetAt: new Date('2026-11-02T00:00:00Z'),
    ...overrides,
  }) as unknown as User;

describe('AdminProfileService', () => {
  let users: jest.Mocked<Pick<UsersService, 'update' | 'findById'>>;
  let audit: jest.Mocked<Pick<AdminAuditService, 'record'>>;
  let service: AdminProfileService;

  beforeEach(() => {
    users = { update: jest.fn().mockResolvedValue(undefined), findById: jest.fn() };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new AdminProfileService(
      users as unknown as UsersService,
      audit as unknown as AdminAuditService,
    );
  });

  it('shows the admin card with a role label and password date', () => {
    expect(service.get(makeAdmin())).toMatchObject({
      id: 'admin-1',
      fullName: 'Marcus Vance',
      email: 'marcus@paysplit.test',
      role: 'super_admin',
      roleLabel: 'Super Admin',
      passwordUpdatedAt: new Date('2026-11-02T00:00:00Z'),
    });
  });

  it('updates changed fields, normalises the phone and audits field names only', async () => {
    const admin = makeAdmin();
    users.findById.mockResolvedValue(
      makeAdmin({ lastName: 'Cole', phoneNumber: '+2348099998888' }),
    );

    const result = await service.update(
      admin,
      { firstName: 'Marcus', lastName: 'Cole', phoneNumber: '08099998888' },
      META,
    );

    expect(users.update).toHaveBeenCalledWith('admin-1', {
      lastName: 'Cole',
      phoneNumber: '+2348099998888',
    });
    expect(audit.record).toHaveBeenCalledWith({
      adminId: 'admin-1',
      action: ADMIN_AUDIT_ACTIONS.PROFILE_UPDATED,
      metadata: { fields: ['lastName', 'phoneNumber'] },
      meta: META,
    });
    expect(result.lastName).toBe('Cole');
  });

  it('does nothing when nothing changed', async () => {
    await service.update(makeAdmin(), { firstName: 'Marcus', phoneNumber: '08031234567' }, META);
    expect(users.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects an invalid phone number', async () => {
    await expect(service.update(makeAdmin(), { phoneNumber: '12345' }, META)).rejects.toMatchObject(
      {
        response: { code: ADMIN_ERROR_CODES.INVALID_PHONE },
      },
    );
    expect(users.update).not.toHaveBeenCalled();
  });
});

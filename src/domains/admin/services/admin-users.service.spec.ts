import { Op } from 'sequelize';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/services/users.service';
import { SalaryAccountService } from '../../salary-account/services/salary-account.service';
import { WalletsService } from '../../wallets/services/wallets.service';
import { AdminAuditService } from '../../audit/services/admin-audit.service';
import { ADMIN_AUDIT_ACTIONS } from '../../audit/constants/audit.constants';
import { AdminUsersService, ADMIN_ERROR_CODES } from './admin-users.service';

const META = { ip: '203.0.113.7', userAgent: 'jest' };
const ADMIN = { id: 'admin-1' } as User;

const customer = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'u-1',
    firstName: 'Paul',
    lastName: 'Clarke',
    email: 'paul@paysplit.test',
    phoneNumber: '+2348031234567',
    isActive: true,
    kycStatus: 'approved',
    createdAt: new Date('2026-10-01T09:00:00Z'),
    kycVerification: {
      method: 'bvn',
      identityStatus: 'passed',
      livenessStatus: 'passed',
      idNumberLast4: '6373',
      approvedAt: new Date('2026-10-02T09:00:00Z'),
    },
    ...overrides,
  }) as unknown as User;

describe('AdminUsersService', () => {
  const models = {
    users: { count: jest.fn(), findOne: jest.fn(), findAndCountAll: jest.fn() },
    profiles: { findAll: jest.fn().mockResolvedValue([]), findOne: jest.fn() },
    transactions: { findOne: jest.fn(), findAll: jest.fn().mockResolvedValue([]) },
    beneficiaries: { count: jest.fn() },
    rules: { count: jest.fn() },
    attempts: { findAll: jest.fn() },
  };
  const usersService = { findRoleByName: jest.fn().mockResolvedValue({ id: 'role-user' }) };
  const salaryAccounts = {
    getView: jest.fn().mockResolvedValue({
      status: 'not_issued',
      balance: 0,
      currency: 'NGN',
      accountName: 'Paul Clarke',
      accountNumber: null,
      maskedAccountNumber: null,
      bankName: null,
    }),
    summaries: jest.fn((ids: string[]) =>
      Promise.resolve(
        new Map(
          ids.map((id) => [
            id,
            { status: 'not_issued', bankName: null, maskedAccountNumber: null, currency: 'NGN' },
          ]),
        ),
      ),
    ),
  };
  const wallets = { list: jest.fn() };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };

  const service = new AdminUsersService(
    models.users as never,
    models.profiles as never,
    models.transactions as never,
    models.beneficiaries as never,
    models.rules as never,
    models.attempts as never,
    usersService as unknown as UsersService,
    salaryAccounts as unknown as SalaryAccountService,
    wallets as unknown as WalletsService,
    audit as unknown as AdminAuditService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('computes the overview stat cards for customers only', async () => {
    models.users.count.mockResolvedValueOnce(8).mockResolvedValueOnce(5);
    models.transactions.findOne.mockResolvedValue({ total: '5561250000', employees: '7' });

    await expect(service.overview()).resolves.toEqual({
      totalUsers: 8,
      verifiedUsers: 5,
      unverifiedUsers: 3,
      verificationRate: 62.5,
      totalSalaryPaid: { amount: 5_561_250_000, employeeCount: 7 },
    });
    expect(models.users.count).toHaveBeenCalledWith({
      where: { roleId: 'role-user', passwordSetAt: { [Op.ne]: null } },
    });
  });

  it('reports zeros on an empty platform', async () => {
    models.users.count.mockResolvedValue(0);
    models.transactions.findOne.mockResolvedValue({ total: null, employees: '0' });
    await expect(service.overview()).resolves.toMatchObject({
      verificationRate: 0,
      totalSalaryPaid: { amount: 0, employeeCount: 0 },
    });
  });

  it('404s for ids that are not customers (including admins)', async () => {
    models.users.findOne.mockResolvedValue(null);
    await expect(service.get('admin-2', ADMIN, META)).rejects.toMatchObject({
      response: { code: ADMIN_ERROR_CODES.USER_NOT_FOUND },
    });
    expect(models.users.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'admin-2', roleId: 'role-user', passwordSetAt: { [Op.ne]: null } },
      }),
    );
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('builds the user detail stat cards and audits the view', async () => {
    models.users.findOne.mockResolvedValue(customer());
    wallets.list.mockResolvedValue([{ balance: 150_000 }, { balance: 50_000 }]);
    models.beneficiaries.count.mockResolvedValueOnce(4).mockResolvedValueOnce(3);
    models.rules.count.mockResolvedValue(2);

    const detail = await service.get('u-1', ADMIN, META);

    expect(detail.stats).toEqual({
      wallets: { count: 2, totalBalance: 200_000 },
      beneficiaries: { count: 4, categoryCount: 3 },
      activeSplitRules: 2,
      expectedSalaryDate: null,
    });
    expect(detail.kyc.summary).toBe('BVN + Biometrics');
    expect(audit.record).toHaveBeenCalledWith({
      adminId: 'admin-1',
      action: ADMIN_AUDIT_ACTIONS.USER_VIEWED,
      targetType: 'user',
      targetId: 'u-1',
      meta: META,
    });
  });

  it('returns the verification tab with a masked ID and per-step dates', async () => {
    models.users.findOne.mockResolvedValue(customer());
    models.profiles.findOne.mockResolvedValue({ monthlyAmount: 85_000_000 });
    const livenessAt = new Date('2026-10-02T08:00:00Z');
    const identityAt = new Date('2026-10-01T10:00:00Z');
    models.attempts.findAll.mockResolvedValue([
      { step: 'liveness', createdAt: livenessAt },
      { step: 'identity', createdAt: identityAt },
      { step: 'identity', createdAt: new Date('2026-10-01T09:30:00Z') },
    ]);

    const result = await service.verification('u-1', ADMIN, META);

    expect(result.otherDetails).toEqual({
      salaryAmount: 85_000_000,
      phoneNumber: '+2348031234567',
      governmentId: { type: 'BVN', maskedNumber: '*******6373' },
    });
    expect(result.kyc.checklist).toEqual([
      expect.objectContaining({
        step: 'identity',
        label: 'BVN',
        submittedAt: identityAt,
        attempts: 2,
      }),
      expect.objectContaining({
        step: 'liveness',
        label: 'Biometric selfie',
        status: 'passed',
        submittedAt: livenessAt,
        attempts: 1,
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain('idNumberEncrypted');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: ADMIN_AUDIT_ACTIONS.USER_VERIFICATION_VIEWED }),
    );
  });

  it('filters the list by verification status', async () => {
    models.users.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
    await service.list({ verification: 'unverified', page: 1, limit: 10 });
    const [options] = models.users.findAndCountAll.mock.calls[0] as [
      { where: Record<symbol, unknown[]> },
    ];
    const where = options.where;
    expect(where[Op.and]).toContainEqual({ kycStatus: { [Op.ne]: 'approved' } });
  });
});

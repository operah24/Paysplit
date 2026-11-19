import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Op, WhereOptions } from 'sequelize';
import { User } from '../../users/entities/user.entity';
import { ROLES, UsersService } from '../../users/services/users.service';
import { KycVerification } from '../../kyc/entities/kyc-verification.entity';
import { KycAttempt } from '../../kyc/entities/kyc-attempt.entity';
import { SalaryProfile } from '../../income/entities/salary-profile.entity';
import { LedgerTransaction } from '../../ledger/entities/ledger-transaction.entity';
import { LEDGER_TRANSACTION_TYPES as T } from '../../ledger/constants/ledger.constants';
import { Beneficiary } from '../../beneficiaries/entities/beneficiary.entity';
import { SplitRule } from '../../split-rules/entities/split-rule.entity';
import { WalletsService } from '../../wallets/services/wallets.service';
import {
  SalaryAccountService,
  SalaryAccountView,
} from '../../salary-account/services/salary-account.service';
import { AdminAuditService } from '../../audit/services/admin-audit.service';
import { ADMIN_AUDIT_ACTIONS } from '../../audit/constants/audit.constants';
import type { KycStepStatus } from '../../kyc/constants/kyc.constants';
import { AdminListUsersQuery } from '../dtos/admin.dtos';
import {
  AdminUserRow,
  SalaryPaidTotals,
  kycMethodLabel,
  maskIdNumber,
  toAdminUserRow,
} from '../utils/admin-user-view.util';
import { AppError } from '../../../shared/utils/app-error.util';
import { PaginatedResult } from '../../../shared/utils/pagination.utils';
import { percentOf, toMinor } from '../../../shared/utils/money.util';
import type { RequestMeta } from '../../../shared/decorators/request-meta.decorator';

export const ADMIN_ERROR_CODES = {
  USER_NOT_FOUND: 'ADMIN_USER_NOT_FOUND',
  SALARY_PAYMENT_NOT_FOUND: 'SALARY_PAYMENT_NOT_FOUND',
  TRANSACTION_NOT_FOUND: 'TRANSACTION_NOT_FOUND',
  INVALID_PHONE: 'INVALID_PHONE',
} as const;

export interface AdminOverview {
  totalUsers: number;
  verifiedUsers: number;
  unverifiedUsers: number;

  verificationRate: number;
  totalSalaryPaid: {
    amount: number;

    employeeCount: number;
  };
}

export interface AdminUserDetail extends AdminUserRow {
  phoneNumber: string | null;
  lastLoginAt: Date | null;
  salaryAccountDetails: SalaryAccountView;
  stats: {
    wallets: { count: number; totalBalance: number };
    beneficiaries: { count: number; categoryCount: number };
    activeSplitRules: number;

    expectedSalaryDate: string | null;
  };
}

export interface KycChecklistItem {
  step: 'identity' | 'liveness';

  label: string;
  status: KycStepStatus;

  reviewedBy: string;

  submittedAt: Date | null;
  attempts: number;
}

export interface AdminUserVerification {
  accountDetails: Pick<
    SalaryAccountView,
    'status' | 'accountName' | 'maskedAccountNumber' | 'bankName' | 'currency'
  >;
  otherDetails: {
    salaryAmount: number | null;
    phoneNumber: string | null;
    governmentId: { type: string | null; maskedNumber: string | null };
  };
  kyc: {
    status: User['kycStatus'];
    approvedAt: Date | null;
    checklist: KycChecklistItem[];
  };
}

@Injectable()
export class AdminUsersService {
  private customerRoleId?: Promise<string>;

  constructor(
    @InjectModel(User) private readonly users: typeof User,
    @InjectModel(SalaryProfile) private readonly profiles: typeof SalaryProfile,
    @InjectModel(LedgerTransaction) private readonly transactions: typeof LedgerTransaction,
    @InjectModel(Beneficiary) private readonly beneficiaries: typeof Beneficiary,
    @InjectModel(SplitRule) private readonly rules: typeof SplitRule,
    @InjectModel(KycAttempt) private readonly attempts: typeof KycAttempt,
    private readonly usersService: UsersService,
    private readonly salaryAccounts: SalaryAccountService,
    private readonly wallets: WalletsService,
    private readonly audit: AdminAuditService,
  ) {}

  async overview(): Promise<AdminOverview> {
    const customers = await this.customerWhere();
    const [totalUsers, verifiedUsers, salary] = await Promise.all([
      this.users.count({ where: customers }),
      this.users.count({ where: { ...customers, kycStatus: 'approved' } }),
      this.transactions.findOne({
        attributes: [
          [Sequelize.fn('SUM', Sequelize.col('amount')), 'total'],
          [Sequelize.fn('COUNT', Sequelize.fn('DISTINCT', Sequelize.col('user_id'))), 'employees'],
        ],
        where: { type: T.SALARY_CREDIT, status: 'success' },
        raw: true,
      }) as unknown as Promise<{ total: string | null; employees: string | null } | null>,
    ]);

    return {
      totalUsers,
      verifiedUsers,
      unverifiedUsers: totalUsers - verifiedUsers,
      verificationRate: totalUsers ? percentOf(verifiedUsers, totalUsers) : 0,
      totalSalaryPaid: {
        amount: toMinor(salary?.total),
        employeeCount: Number(salary?.employees ?? 0),
      },
    };
  }

  async list(query: AdminListUsersQuery): Promise<PaginatedResult<AdminUserRow>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, query.limit ?? 10);
    const and: WhereOptions<User>[] = [await this.customerWhere()];

    if (query.verification === 'verified') and.push({ kycStatus: 'approved' });
    if (query.verification === 'unverified') and.push({ kycStatus: { [Op.ne]: 'approved' } });

    const search = query.search?.trim();
    if (search) {
      const like = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      and.push({
        [Op.or]: [
          { email: { [Op.iLike]: like } },
          Sequelize.where(
            Sequelize.fn(
              'concat',
              Sequelize.col('User.first_name'),
              ' ',
              Sequelize.col('User.last_name'),
            ),
            { [Op.iLike]: like },
          ),
        ],
      });
    }

    const { count, rows } = await this.users.findAndCountAll({
      where: { [Op.and]: and },
      include: [{ model: KycVerification, required: false }],
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    });

    return {
      data: await this.toRows(rows),
      pagination: { total: count, page, limit, pages: Math.ceil(count / limit) },
    };
  }

  async get(id: string, admin: User, meta: RequestMeta): Promise<AdminUserDetail> {
    const user = await this.findCustomerOrThrow(id);
    const [[row], account, wallets, beneficiaryCount, categoryCount, activeSplitRules] =
      await Promise.all([
        this.toRows([user]),
        this.salaryAccounts.getView(user),
        this.wallets.list(id),
        this.beneficiaries.count({ where: { userId: id } }),
        this.beneficiaries.count({ where: { userId: id }, distinct: true, col: 'categoryId' }),
        this.rules.count({ where: { userId: id, status: 'active' } }),
      ]);

    await this.audit.record({
      adminId: admin.id,
      action: ADMIN_AUDIT_ACTIONS.USER_VIEWED,
      targetType: 'user',
      targetId: id,
      meta,
    });

    return {
      ...row,
      phoneNumber: user.phoneNumber ?? null,
      lastLoginAt: user.lastLoginAt ?? null,
      salaryAccountDetails: account,
      stats: {
        wallets: {
          count: wallets.length,
          totalBalance: wallets.reduce((sum, wallet) => sum + wallet.balance, 0),
        },
        beneficiaries: { count: beneficiaryCount, categoryCount },
        activeSplitRules,
        expectedSalaryDate: row.salary?.nextPayday ?? null,
      },
    };
  }

  async verification(id: string, admin: User, meta: RequestMeta): Promise<AdminUserVerification> {
    const user = await this.findCustomerOrThrow(id);
    const [account, profile, attempts] = await Promise.all([
      this.salaryAccounts.getView(user),
      this.profiles.findOne({ where: { userId: id } }),
      this.attempts.findAll({
        where: { userId: id },
        attributes: ['step', 'createdAt'],
        order: [['createdAt', 'DESC']],
      }),
    ]);

    await this.audit.record({
      adminId: admin.id,
      action: ADMIN_AUDIT_ACTIONS.USER_VERIFICATION_VIEWED,
      targetType: 'user',
      targetId: id,
      meta,
    });

    const kyc = user.kycVerification ?? null;
    const methodLabel = kycMethodLabel(kyc?.method);
    const step = (name: 'identity' | 'liveness', label: string, status: KycStepStatus) => {
      const forStep = attempts.filter((attempt) => attempt.step === name);
      return {
        step: name,
        label,
        status,
        reviewedBy: 'Automated (Dojah)',
        submittedAt: forStep[0]?.createdAt ?? null,
        attempts: forStep.length,
      };
    };

    return {
      accountDetails: {
        status: account.status,
        accountName: account.accountName,
        maskedAccountNumber: account.maskedAccountNumber,
        bankName: account.bankName,
        currency: account.currency,
      },
      otherDetails: {
        salaryAmount: profile?.monthlyAmount ?? null,
        phoneNumber: user.phoneNumber ?? null,
        governmentId: { type: methodLabel, maskedNumber: maskIdNumber(kyc?.idNumberLast4) },
      },
      kyc: {
        status: user.kycStatus,
        approvedAt: kyc?.approvedAt ?? null,
        checklist: [
          step('identity', methodLabel ?? 'Identity', kyc?.identityStatus ?? 'not_started'),
          step('liveness', 'Biometric selfie', kyc?.livenessStatus ?? 'not_started'),
        ],
      },
    };
  }

  async findCustomerOrThrow(id: string): Promise<User> {
    const user = await this.users.findOne({
      where: { id, ...(await this.customerWhere()) },
      include: [{ model: KycVerification, required: false }],
    });
    if (!user) throw AppError.notFound(ADMIN_ERROR_CODES.USER_NOT_FOUND, 'User not found.');
    return user;
  }

  private async customerWhere(): Promise<WhereOptions<User>> {
    this.customerRoleId ??= this.usersService.findRoleByName(ROLES.USER).then((role) => {
      if (!role) throw new Error(`Role "${ROLES.USER}" is missing. Run the role seeder.`);
      return role.id;
    });
    try {
      return { roleId: await this.customerRoleId, passwordSetAt: { [Op.ne]: null } };
    } catch (error) {
      this.customerRoleId = undefined;
      throw error;
    }
  }

  private async toRows(users: User[]): Promise<AdminUserRow[]> {
    if (!users.length) return [];
    const ids = users.map((user) => user.id);
    const [profiles, paid, accounts] = await Promise.all([
      this.profiles.findAll({ where: { userId: { [Op.in]: ids } } }),
      this.salaryPaidByUser(ids),
      this.salaryAccounts.summaries(ids),
    ]);
    const profileByUser = new Map(profiles.map((profile) => [profile.userId, profile]));
    return users.map((user) =>
      toAdminUserRow(
        user,
        profileByUser.get(user.id) ?? null,
        paid.get(user.id),
        accounts.get(user.id)!,
      ),
    );
  }

  private async salaryPaidByUser(ids: string[]): Promise<Map<string, SalaryPaidTotals>> {
    const rows = (await this.transactions.findAll({
      attributes: [
        'userId',
        [Sequelize.fn('SUM', Sequelize.col('amount')), 'total'],
        [Sequelize.fn('MAX', Sequelize.col('created_at')), 'lastPaidAt'],
      ],
      where: { userId: { [Op.in]: ids }, type: T.SALARY_CREDIT, status: 'success' },
      group: ['userId'],
      raw: true,
    })) as unknown as { userId: string; total: string; lastPaidAt: Date | string }[];
    return new Map(
      rows.map((row) => [
        row.userId,
        { total: toMinor(row.total), lastPaidAt: row.lastPaidAt ? new Date(row.lastPaidAt) : null },
      ]),
    );
  }
}

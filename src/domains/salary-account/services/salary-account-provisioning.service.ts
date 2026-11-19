import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { CreationAttributes, Op, QueryTypes, UniqueConstraintError } from 'sequelize';
import { HepaidService } from '../../../integration/hepaid/hepaid.service';
import { HepaidError } from '../../../integration/hepaid/hepaid.error';
import { CreateHepaidWalletInput, HepaidWallet } from '../../../integration/hepaid/hepaid.types';
import { UsersService } from '../../users/services/users.service';
import { User } from '../../users/entities/user.entity';
import { KycVerification } from '../../kyc/entities/kyc-verification.entity';
import { KycCryptoService } from '../../kyc/services/kyc-crypto.service';
import { LedgerService } from '../../ledger/services/ledger.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { SalaryAccount } from '../entities/salary-account.entity';

export const MAX_WALLET_ATTEMPTS = 3;

export const MAX_PROVIDER_RETRIES = 10;

const RETRY_INTERVAL_MS = 60_000;

export interface ProvisioningJobResult {
  checked: number;
  active: number;
  pending: number;
  failed: number;
}

@Injectable()
export class SalaryAccountProvisioningService {
  private readonly logger = new Logger(SalaryAccountProvisioningService.name);

  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    @InjectModel(SalaryAccount) private readonly accounts: typeof SalaryAccount,
    @InjectModel(KycVerification) private readonly verifications: typeof KycVerification,
    private readonly hepaid: HepaidService,
    private readonly users: UsersService,
    private readonly crypto: KycCryptoService,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
  ) {}

  static reference(userId: string, attempt: number): string {
    return attempt === 0 ? `ps-${userId}` : `ps-${userId}-${attempt + 1}`;
  }

  async provision(userId: string): Promise<SalaryAccount | null> {
    try {
      return await this.provisionOrThrow(userId);
    } catch (error) {
      this.logger.error(
        `Salary account provisioning failed for user ${userId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  async runPending(limit = 25): Promise<ProvisioningJobResult> {
    const result: ProvisioningJobResult = { checked: 0, active: 0, pending: 0, failed: 0 };
    if (!this.hepaid.isConfigured) return result;

    const pending = await this.accounts.findAll({
      where: {
        status: 'pending',
        [Op.or]: [
          { lastAttemptAt: null },
          { lastAttemptAt: { [Op.lt]: new Date(Date.now() - RETRY_INTERVAL_MS) } },
        ],
      },
      order: [['updatedAt', 'ASC']],
      limit,
    });
    const missing = await this.sequelize.query<{ id: string }>(
      `SELECT u.id FROM users u
         LEFT JOIN salary_accounts s ON s.user_id = u.id
        WHERE u.kyc_status = 'approved' AND s.id IS NULL
        ORDER BY u.created_at
        LIMIT :limit`,
      { type: QueryTypes.SELECT, replacements: { limit } },
    );

    const userIds = [...pending.map((account) => account.userId), ...missing.map((u) => u.id)];
    for (const userId of userIds) {
      const account = await this.provision(userId);
      result.checked++;
      if (account?.status === 'active') result.active++;
      else if (account?.status === 'failed') result.failed++;
      else result.pending++;
    }
    return result;
  }

  private async provisionOrThrow(userId: string): Promise<SalaryAccount | null> {
    if (!this.hepaid.isConfigured) {
      this.logger.warn('HePaid is not configured; salary account not issued.');
      return null;
    }
    const user = await this.users.findById(userId);
    if (!user || user.kycStatus !== 'approved') return null;

    const record = await this.findOrCreateRecord(userId);
    if (record.status !== 'pending') return record;

    if (record.providerWalletId) {
      return this.apply(record, user, await this.hepaid.getWallet(record.providerReference));
    }

    const verification = await this.verifications.findOne({ where: { userId } });
    if (!SalaryAccountProvisioningService.hasWalletIdentity(verification)) {
      this.logger.log(`User ${userId} has no BVN/NIN; salary account not available`);
      return record.update({
        status: 'not_eligible',
        failureReason: 'A BVN or NIN is required for a salary account',
      });
    }
    return this.create(record, user, verification!);
  }

  private async findOrCreateRecord(userId: string): Promise<SalaryAccount> {
    const existing = await this.accounts.findOne({ where: { userId } });
    if (existing) return existing;
    try {
      return await this.accounts.create({
        userId,
        providerReference: SalaryAccountProvisioningService.reference(userId, 0),
        status: 'pending',
      } as CreationAttributes<SalaryAccount>);
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        return (await this.accounts.findOne({ where: { userId } }))!;
      }
      throw error;
    }
  }

  private async create(
    record: SalaryAccount,
    user: User,
    verification: KycVerification,
  ): Promise<SalaryAccount> {
    const input = this.walletInput(record, user, verification);
    try {
      const wallet = await this.hepaid.createWallet(input);
      return await this.apply(record, user, wallet);
    } catch (error) {
      if (!(error instanceof HepaidError)) throw error;
      const reason = `${error.code}: ${error.message}`.slice(0, 300);

      if (error.code === 'duplicate_reference') {
        return this.apply(record, user, await this.hepaid.getWallet(record.providerReference));
      }

      if (error.isOutcomeUnknown) {
        const retryCount = record.retryCount + 1;
        this.logger.warn(
          `HePaid wallet creation unavailable for user ${user.id} (${error.code}); retry ${retryCount}`,
        );
        return record.update({
          retryCount,
          lastAttemptAt: new Date(),
          failureReason: reason,
          status: retryCount >= MAX_PROVIDER_RETRIES ? 'failed' : 'pending',
        });
      }

      this.logger.error(`HePaid rejected wallet creation for user ${user.id}: ${error.code}`);
      return record.update({ status: 'failed', failureReason: reason, lastAttemptAt: new Date() });
    }
  }

  static walletIdentity(
    verification: KycVerification | null,
  ): { method: 'bvn' | 'nin'; encrypted: string } | null {
    if (verification?.walletIdMethod && verification.walletIdEncrypted) {
      return { method: verification.walletIdMethod, encrypted: verification.walletIdEncrypted };
    }
    if (
      verification?.idNumberEncrypted &&
      (verification.method === 'bvn' || verification.method === 'nin')
    ) {
      return { method: verification.method, encrypted: verification.idNumberEncrypted };
    }
    return null;
  }

  static hasWalletIdentity(verification: KycVerification | null): boolean {
    return SalaryAccountProvisioningService.walletIdentity(verification) !== null;
  }

  async retryWithNewIdentity(userId: string): Promise<SalaryAccount | null> {
    const record = await this.accounts.findOne({ where: { userId } });
    if (record && (record.status === 'failed' || record.status === 'not_eligible')) {
      const attempts = record.attempts + 1;
      await record.update({
        status: 'pending',
        attempts,
        providerReference: SalaryAccountProvisioningService.reference(userId, attempts),
        providerWalletId: null,
        retryCount: 0,
        failureReason: null,
        lastAttemptAt: null,
      });
    }
    return this.provision(userId);
  }

  private walletInput(
    record: SalaryAccount,
    user: User,
    verification: KycVerification,
  ): CreateHepaidWalletInput {
    const name =
      [verification.legalFirstName, verification.legalLastName].filter(Boolean).join(' ') ||
      `${user.firstName} ${user.lastName}`.trim();
    const identity = SalaryAccountProvisioningService.walletIdentity(verification)!;

    return {
      reference: record.providerReference,
      customer: { email: user.email, externalId: user.id, name },
      identity: {
        type: identity.method === 'bvn' ? 'Bvn' : 'Nin',
        number: this.crypto.decrypt(identity.encrypted),
      },
      accountName: name,
      metadata: { userId: user.id },
    };
  }

  private async apply(
    record: SalaryAccount,
    user: User,
    wallet: HepaidWallet,
  ): Promise<SalaryAccount> {
    const common = {
      providerWalletId: wallet.id,
      mode: wallet.mode,
      identityType: wallet.fundingAccount?.identityType ?? null,
      lastAttemptAt: new Date(),
      retryCount: 0,
    };

    switch (wallet.status) {
      case 'Active': {
        const funding = wallet.fundingAccount;
        await this.ledger.getOrCreateSalaryAccount(user.id);
        const wasActive = record.status === 'active';
        const updated = await record.update({
          ...common,
          status: 'active',
          accountName: funding?.accountName ?? null,
          accounts: (funding?.accounts ?? []).map((a) => ({
            bankCode: a.bankCode,
            bankName: a.bankName,
            accountNumber: a.accountNumber,
            accountName: a.accountName,
          })),
          failureReason: null,
          activatedAt: record.activatedAt ?? new Date(),
        });
        if (!wasActive) {
          this.logger.log(`Salary account active for user ${user.id}`);
          const bank = updated.accounts[0]?.bankName;
          await this.notifications.notify(user, {
            type: 'salary_account_issued',
            topic: 'accountUpdates',
            title: 'Your salary account is ready',
            body: `Your dedicated PaySplit salary account${bank ? ` (${bank})` : ''} is ready. Open Account Details to share it with your employer.`,
            data: { status: 'active' },
            email: true,
          });
        }
        return updated;
      }
      case 'Pending':
        return record.update({ ...common, status: 'pending' });
      case 'Closed':
        return record.update({ ...common, status: 'closed' });
      case 'Failed':
      default: {
        const attempts = record.attempts + 1;
        const reason = (wallet.failureReason ?? 'HePaid could not create the wallet').slice(0, 300);
        this.logger.warn(`HePaid wallet failed for user ${user.id} (attempt ${attempts})`);
        if (attempts >= MAX_WALLET_ATTEMPTS) {
          return record.update({ ...common, status: 'failed', attempts, failureReason: reason });
        }

        return record.update({
          ...common,
          status: 'pending',
          attempts,
          failureReason: reason,
          providerWalletId: null,
          providerReference: SalaryAccountProvisioningService.reference(user.id, attempts),
        });
      }
    }
  }
}

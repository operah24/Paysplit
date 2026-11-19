import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import { HepaidService } from '../../../integration/hepaid/hepaid.service';
import { HepaidError } from '../../../integration/hepaid/hepaid.error';
import { SalaryAccount } from '../../salary-account/entities/salary-account.entity';
import { LEDGER_TRANSACTION_TYPES as T } from '../../ledger/constants/ledger.constants';
import { toMinor } from '../../../shared/utils/money.util';

export interface ReconciliationResult {
  skipped: boolean;
  checked: number;
  mismatched: number;
  errors: number;
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);
  private readonly simulation: boolean;

  constructor(
    configService: ConfigService,
    private readonly hepaid: HepaidService,
    @InjectConnection() private readonly sequelize: Sequelize,
    @InjectModel(SalaryAccount) private readonly salaryAccounts: typeof SalaryAccount,
  ) {
    this.simulation = configService.get<boolean>('payments.simulation', false);
  }

  async run(limit = 500): Promise<ReconciliationResult> {
    const result: ReconciliationResult = { skipped: false, checked: 0, mismatched: 0, errors: 0 };
    if (this.simulation || !this.hepaid.isConfigured) return { ...result, skipped: true };

    const accounts = await this.salaryAccounts.findAll({
      where: { status: 'active' },
      order: [['reconciledAt', 'ASC NULLS FIRST']],
      limit,
    });
    for (const account of accounts) {
      try {
        const wallet = await this.hepaid.getWallet(account.providerReference);
        const provider = wallet.balance.available + wallet.balance.inTransit;
        const expected = await this.expectedBalance(account.userId);
        const diff = provider - expected;
        await account.update({ reconciledAt: new Date(), reconciliationDiff: diff });
        result.checked++;
        if (diff !== 0) {
          result.mismatched++;
          this.logger.warn(
            `Reconciliation mismatch for salary account ${account.id}: HePaid − ledger = ${diff} kobo`,
          );
        }
      } catch (error) {
        result.errors++;
        const code = error instanceof HepaidError ? error.code : (error as Error).message;
        this.logger.warn(`Reconciliation failed for salary account ${account.id}: ${code}`);
      }
    }
    if (result.mismatched > 0) {
      this.logger.error(`Reconciliation: ${result.mismatched} salary account(s) out of balance`);
    }
    return result;
  }

  async expectedBalance(userId: string): Promise<number> {
    const [row] = await this.sequelize.query<{ accounts: string; pending: string }>(
      `SELECT
         (SELECT COALESCE(SUM(balance), 0) FROM ledger_accounts
           WHERE user_id = :userId AND type IN ('salary', 'wallet')) AS accounts,
         (SELECT COALESCE(SUM(amount + fee), 0) FROM ledger_transactions
           WHERE user_id = :userId AND type = :payout AND status = 'pending') AS pending`,
      { type: QueryTypes.SELECT, replacements: { userId, payout: T.BENEFICIARY_PAYOUT } },
    );
    return toMinor(row.accounts) + toMinor(row.pending);
  }
}

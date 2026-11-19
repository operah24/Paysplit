import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { HepaidService } from '../../../integration/hepaid/hepaid.service';
import { HepaidError } from '../../../integration/hepaid/hepaid.error';
import { HepaidTransfer } from '../../../integration/hepaid/hepaid.types';
import { LedgerService, InsufficientFundsError } from '../../ledger/services/ledger.service';
import { LedgerTransaction } from '../../ledger/entities/ledger-transaction.entity';
import {
  LEDGER_TRANSACTION_TYPES as T,
  SYSTEM_ACCOUNTS,
} from '../../ledger/constants/ledger.constants';
import { Beneficiary } from '../../beneficiaries/entities/beneficiary.entity';
import { SalaryAccountService } from '../../salary-account/services/salary-account.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { UsersService } from '../../users/services/users.service';
import { formatNaira } from '../../../shared/utils/money.util';
import { SplitRun } from '../entities/split-run.entity';
import {
  PAYOUT_DISPATCH_TIMEOUT_MS,
  PAYOUT_SYNC_MIN_AGE_MS,
  SplitRunStatus,
} from '../constants/split-engine.constants';

export interface PayoutSyncResult {
  checked: number;
  succeeded: number;
  failed: number;
  pending: number;
}

@Injectable()
export class PayoutService {
  private readonly logger = new Logger(PayoutService.name);
  private readonly simulation: boolean;

  constructor(
    configService: ConfigService,
    private readonly hepaid: HepaidService,
    private readonly ledger: LedgerService,
    private readonly salaryAccounts: SalaryAccountService,
    private readonly notifications: NotificationsService,
    private readonly users: UsersService,
    @InjectModel(LedgerTransaction) private readonly transactions: typeof LedgerTransaction,
    @InjectModel(SplitRun) private readonly runs: typeof SplitRun,
  ) {
    this.simulation = configService.get<boolean>('payments.simulation', false);
  }

  async dispatch(transactionId: string): Promise<void> {
    try {
      const tx = await this.loadPending(transactionId);
      if (!tx) return;

      if (this.simulation) {
        await this.succeed(tx.id, tx.fee, `sim:${tx.reference}`, { simulated: true });
        return;
      }

      const beneficiary = tx.beneficiary;
      const salaryAccount = await this.salaryAccounts.findActive(tx.userId);
      if (!beneficiary || !salaryAccount) {
        await this.fail(
          tx.id,
          !beneficiary ? 'Beneficiary no longer exists' : 'Salary account is not active',
        );
        return;
      }

      try {
        const transfer = await this.hepaid.createTransfer({
          reference: tx.reference,
          amount: tx.amount,
          recipient: {
            bankCode: beneficiary.bankCode,
            bankName: beneficiary.bankName,
            accountNumber: beneficiary.accountNumber,
            accountName: beneficiary.accountName,
          },
          narration: (tx.narration ?? 'PaySplit transfer').slice(0, 100),
          sourceWallet: salaryAccount.providerReference,
          metadata: { userId: tx.userId, transactionId: tx.id },
        });
        await this.applyTransfer(tx, transfer);
      } catch (error) {
        if (!(error instanceof HepaidError)) throw error;
        if (error.isOutcomeUnknown) {
          const attempts = Number(tx.metadata?.dispatchAttempts ?? 0) + 1;
          this.logger.warn(`Payout ${tx.reference} dispatch failed (${error.code}); will retry`);
          await tx.update({
            metadata: { ...(tx.metadata ?? {}), dispatchAttempts: attempts, lastError: error.code },
          });
          return;
        }
        await this.fail(tx.id, PayoutService.failureMessage(error));
      }
    } catch (error) {
      this.logger.error(`Payout ${transactionId} dispatch error: ${(error as Error).message}`);
    }
  }

  async syncPending(limit = 50): Promise<PayoutSyncResult> {
    const result: PayoutSyncResult = { checked: 0, succeeded: 0, failed: 0, pending: 0 };
    const rows = await this.transactions.findAll({
      where: {
        type: T.BENEFICIARY_PAYOUT,
        status: 'pending',
        createdAt: { [Op.lt]: new Date(Date.now() - PAYOUT_SYNC_MIN_AGE_MS) },
      },
      order: [['createdAt', 'ASC']],
      limit,
    });

    for (const row of rows) {
      result.checked++;
      await this.syncOne(row);
      const after = await this.transactions.findByPk(row.id);
      if (after?.status === 'success') result.succeeded++;
      else if (after?.status === 'failed') result.failed++;
      else result.pending++;
    }
    return result;
  }

  async syncByReference(reference: string): Promise<boolean> {
    const tx = await this.transactions.findOne({
      where: { reference, type: T.BENEFICIARY_PAYOUT },
    });
    if (!tx) return false;
    const transfer = await this.hepaid.getTransfer(reference);
    await this.applyTransfer(tx, transfer);
    return true;
  }

  async refreshRunStatus(runId: string): Promise<SplitRun | null> {
    const run = await this.runs.findByPk(runId);
    if (!run) return null;

    const txs = await this.transactions.findAll({ where: { splitRunId: runId } });
    const wallets = txs.filter((tx) => tx.type === T.WALLET_ALLOCATION && tx.status === 'success');
    const payouts = txs.filter((tx) => tx.type === T.BENEFICIARY_PAYOUT);

    const livePayouts = payouts.filter((tx) => tx.status === 'success' || tx.status === 'pending');
    const charged = payouts.filter((tx) => tx.status !== 'failed');
    const succeeded = txs.filter((tx) => tx.status === 'success').length;
    const failed = txs.filter((tx) => tx.status === 'failed').length;

    let status: SplitRunStatus;
    if (txs.some((tx) => tx.status === 'pending')) status = 'processing';
    else if (succeeded === 0) status = 'failed';
    else if (failed > 0 || run.skipped.length > 0) status = 'partial';
    else status = 'completed';

    const previous = run.status;
    const updated = await run.update({
      status,
      toWallets: wallets.reduce((sum, tx) => sum + tx.amount, 0),
      toBeneficiaries: livePayouts.reduce((sum, tx) => sum + tx.amount, 0),
      fees: charged.reduce((sum, tx) => sum + tx.fee, 0),
      completedAt: status === 'processing' ? null : (run.completedAt ?? new Date()),
    });

    if (previous === 'processing' && status !== 'processing') {
      await this.notifyRunFinished(updated);
    }
    return updated;
  }

  private async syncOne(row: LedgerTransaction): Promise<void> {
    if (this.simulation) return this.dispatch(row.id);

    try {
      const transfer = await this.hepaid.getTransfer(row.reference);
      await this.applyTransfer(row, transfer);
    } catch (error) {
      if (!(error instanceof HepaidError)) {
        this.logger.error(`Payout ${row.reference} sync error: ${(error as Error).message}`);
        return;
      }
      if (error.status !== 404) return;

      if (Date.now() - row.createdAt.getTime() > PAYOUT_DISPATCH_TIMEOUT_MS) {
        await this.fail(row.id, 'The transfer could not be sent');
        return;
      }
      await this.dispatch(row.id);
    }
  }

  private async applyTransfer(tx: LedgerTransaction, transfer: HepaidTransfer): Promise<void> {
    const providerReference = `hepaid:${transfer.id}`;
    switch (transfer.status) {
      case 'Succeeded':
        await this.succeed(tx.id, transfer.fee, providerReference, { gateway: transfer.gateway });
        return;
      case 'Failed':
        await this.fail(tx.id, transfer.failureReason ?? 'Transfer failed', providerReference);
        return;
      case 'Reversed':
        await this.succeed(tx.id, transfer.fee, providerReference, { gateway: transfer.gateway });
        await this.reverse(tx.id, transfer.failureReason ?? 'Sent back by the receiving bank');
        return;
      default:
        if (tx.status === 'pending' && tx.providerReference !== providerReference) {
          await tx.update({
            providerReference,
            metadata: { ...(tx.metadata ?? {}), providerStatus: transfer.status },
          });
        }
    }
  }

  private async succeed(
    transactionId: string,
    actualFee: number,
    providerReference: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    const settled = await this.ledger.inTransaction(async (t) => {
      const tx = await this.transactions.findByPk(transactionId, { transaction: t });
      if (!tx || tx.status !== 'pending') return null;
      const [salary, clearing, outflow, fees] = await Promise.all([
        this.ledger.getOrCreateSalaryAccount(tx.userId, t),
        this.ledger.getSystemAccount(SYSTEM_ACCOUNTS.PAYOUT_CLEARING, t),
        this.ledger.getSystemAccount(SYSTEM_ACCOUNTS.EXTERNAL_OUTFLOW, t),
        this.ledger.getSystemAccount(SYSTEM_ACCOUNTS.PROVIDER_FEES, t),
      ]);
      const reserve = tx.fee;
      const legs = (fee: number) => [
        { accountId: clearing.id, amount: -(tx.amount + reserve) },
        { accountId: outflow.id, amount: tx.amount },
        { accountId: fees.id, amount: fee },
        { accountId: salary.id, amount: reserve - fee },
      ];

      try {
        return await this.ledger.settle(
          tx.id,
          { status: 'success', legs: legs(actualFee), fee: actualFee, providerReference, metadata },
          t,
        );
      } catch (error) {
        if (!(error instanceof InsufficientFundsError)) throw error;
        return this.ledger.settle(
          tx.id,
          {
            status: 'success',
            legs: legs(reserve),
            fee: reserve,
            providerReference,
            metadata: { ...metadata, feeShortfall: actualFee - reserve },
          },
          t,
        );
      }
    });
    if (settled?.splitRunId) await this.refreshRunStatus(settled.splitRunId);
  }

  private async reverse(transactionId: string, reason: string): Promise<void> {
    const settled = await this.ledger.inTransaction(async (t) => {
      const tx = await this.transactions.findByPk(transactionId, { transaction: t });
      if (!tx || tx.status !== 'success') return null;
      const [salary, outflow] = await Promise.all([
        this.ledger.getOrCreateSalaryAccount(tx.userId, t),
        this.ledger.getSystemAccount(SYSTEM_ACCOUNTS.EXTERNAL_OUTFLOW, t),
      ]);
      return this.ledger.settle(
        tx.id,
        {
          status: 'reversed',
          legs: [
            { accountId: outflow.id, amount: -tx.amount },
            { accountId: salary.id, amount: tx.amount },
          ],
          metadata: { reversalReason: reason.slice(0, 200) },
        },
        t,
        ['success'],
      );
    });
    if (!settled) return;

    this.logger.warn(`Payout ${settled.reference} reversed by the receiving bank`);
    const user = await this.users.findById(settled.userId);
    if (user) {
      await this.notifications.notify(user, {
        type: 'transfer_reversed',
        topic: 'transferUpdates',
        title: 'Transfer returned',
        body: `Your transfer of ${formatNaira(settled.amount)} to ${settled.counterpartyName ?? 'your beneficiary'} was sent back by their bank, so the money is back in your salary account. The transfer fee isn't refunded.`,
        data: { transactionId: settled.id, reference: settled.reference },
        email: true,
      });
    }
    if (settled.splitRunId) await this.refreshRunStatus(settled.splitRunId);
  }

  private async fail(
    transactionId: string,
    reason: string,
    providerReference?: string,
  ): Promise<void> {
    const settled = await this.ledger.inTransaction(async (t) => {
      const tx = await this.transactions.findByPk(transactionId, { transaction: t });
      if (!tx || tx.status !== 'pending') return null;
      const [salary, clearing] = await Promise.all([
        this.ledger.getOrCreateSalaryAccount(tx.userId, t),
        this.ledger.getSystemAccount(SYSTEM_ACCOUNTS.PAYOUT_CLEARING, t),
      ]);
      const held = tx.amount + tx.fee;
      return this.ledger.settle(
        tx.id,
        {
          status: 'failed',
          legs: [
            { accountId: clearing.id, amount: -held },
            { accountId: salary.id, amount: held },
          ],
          ...(providerReference ? { providerReference } : {}),
          metadata: { failureReason: reason.slice(0, 200) },
        },
        t,
      );
    });
    if (!settled) return;

    this.logger.warn(`Payout ${settled.reference} failed`);
    const user = await this.users.findById(settled.userId);
    if (user) {
      await this.notifications.notify(user, {
        type: 'transfer_failed',
        topic: 'transferUpdates',
        title: 'Transfer failed',
        body: `Your transfer of ${formatNaira(settled.amount)} to ${settled.counterpartyName ?? 'your beneficiary'} failed, so the money is back in your salary account.`,
        data: { transactionId: settled.id, reference: settled.reference },
        email: true,
      });
    }
    if (settled.splitRunId) await this.refreshRunStatus(settled.splitRunId);
  }

  private loadPending(transactionId: string): Promise<LedgerTransaction | null> {
    return this.transactions.findOne({
      where: { id: transactionId, type: T.BENEFICIARY_PAYOUT, status: 'pending' },
      include: [{ model: Beneficiary, paranoid: false, required: false }],
    });
  }

  private async notifyRunFinished(run: SplitRun): Promise<void> {
    const user = await this.users.findById(run.userId);
    if (!user) return;
    const moved = run.toWallets + run.toBeneficiaries;
    const parts = [
      run.toWallets ? `${formatNaira(run.toWallets)} to wallets` : null,
      run.toBeneficiaries ? `${formatNaira(run.toBeneficiaries)} to beneficiaries` : null,
    ].filter(Boolean);

    const content: Record<
      Exclude<SplitRunStatus, 'processing'>,
      { title: string; body: string }
    > = {
      completed: {
        title: 'Salary split complete',
        body: `Your salary was split: ${parts.join(' and ')}.`,
      },
      partial: {
        title: 'Salary split partly complete',
        body: `${formatNaira(moved)} was split${parts.length ? ` (${parts.join(' and ')})` : ''}, but some rules were skipped or failed. Open the split details to see why.`,
      },
      failed: {
        title: "Salary split didn't run",
        body: 'None of your split rules could run. Open the split details to see why.',
      },
    };
    const { title, body } = content[run.status as Exclude<SplitRunStatus, 'processing'>];
    await this.notifications.notify(user, {
      type: `split_${run.status}`,
      topic: 'splitCompleted',
      title,
      body,
      data: { splitRunId: run.id },
      email: true,
    });
  }

  private static failureMessage(error: HepaidError): string {
    switch (error.code) {
      case 'insufficient_balance':
        return 'Not enough money in the salary account at the bank';
      case 'invalid_recipient':
        return "The beneficiary's account could not receive the transfer";
      default:
        return error.message;
    }
  }
}

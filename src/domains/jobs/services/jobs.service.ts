import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { SalaryAccountProvisioningService } from '../../salary-account/services/salary-account-provisioning.service';
import { CreditService } from '../../split-engine/services/credit.service';
import { PayoutService } from '../../split-engine/services/payout.service';
import { ReconciliationService } from '../../split-engine/services/reconciliation.service';

export const JOB_NAMES = [
  'provision-salary-accounts',
  'sync-credits',
  'sync-payouts',
  'reconcile',
] as const;
export type JobName = (typeof JOB_NAMES)[number];

export function jobSchedules(webhooksEnabled: boolean): Record<JobName, string> {
  return {
    'provision-salary-accounts': '0 */5 * * * *',
    'sync-credits': webhooksEnabled ? '0 */30 * * * *' : '0 */2 * * * *',
    'sync-payouts': '30 */2 * * * *',
    reconcile: '0 0 2 * * *',
  };
}

@Injectable()
export class JobsService implements OnModuleInit {
  private readonly logger = new Logger(JobsService.name);
  private readonly running = new Set<JobName>();

  constructor(
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly provisioning: SalaryAccountProvisioningService,
    private readonly credits: CreditService,
    private readonly payouts: PayoutService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  onModuleInit(): void {
    if (!this.configService.get<boolean>('jobs.schedulerEnabled', true)) {
      this.logger.log('In-app job scheduler disabled (JOBS_SCHEDULER_ENABLED=false)');
      return;
    }
    const schedules = jobSchedules(Boolean(this.configService.get<string>('hepaid.webhookSecret')));
    for (const name of JOB_NAMES) {
      const job = CronJob.from({
        cronTime: schedules[name],
        timeZone: 'Africa/Lagos',
        onTick: () => void this.runSafely(name),
      });
      this.schedulerRegistry.addCronJob(name, job);
      job.start();
    }
    this.logger.log(`In-app job scheduler started: ${JOB_NAMES.join(', ')}`);
  }

  async run(name: JobName): Promise<{ job: JobName; skipped?: string; result?: unknown }> {
    if (this.running.has(name)) return { job: name, skipped: 'already running' };
    this.running.add(name);
    const started = Date.now();
    try {
      const result = await this.execute(name);
      this.logger.log(
        `Job ${name} finished in ${Date.now() - started}ms: ${JSON.stringify(result)}`,
      );
      return { job: name, result };
    } finally {
      this.running.delete(name);
    }
  }

  private async runSafely(name: JobName): Promise<void> {
    try {
      await this.run(name);
    } catch (error) {
      this.logger.error(`Job ${name} failed: ${(error as Error).message}`);
    }
  }

  private execute(name: JobName): Promise<unknown> {
    switch (name) {
      case 'provision-salary-accounts':
        return this.provisioning.runPending();
      case 'sync-credits':
        return this.credits.syncFromProvider();
      case 'sync-payouts':
        return this.payouts.syncPending();
      case 'reconcile':
        return this.reconciliation.run();
    }
  }
}

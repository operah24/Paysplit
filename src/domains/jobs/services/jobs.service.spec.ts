import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { JOB_NAMES, JobsService } from './jobs.service';

function setup(schedulerEnabled: boolean) {
  const registry = new SchedulerRegistry();
  const provisioning = { runPending: jest.fn().mockResolvedValue({ checked: 0 }) };
  const credits = { syncFromProvider: jest.fn().mockResolvedValue({ accounts: 0 }) };
  const payouts = { syncPending: jest.fn().mockResolvedValue({ checked: 0 }) };
  const reconciliation = { run: jest.fn().mockResolvedValue({ skipped: true }) };
  const service = new JobsService(
    { get: () => schedulerEnabled } as unknown as ConfigService,
    registry,
    provisioning as never,
    credits as never,
    payouts as never,
    reconciliation as never,
  );
  return { service, registry, provisioning, credits };
}

describe('JobsService', () => {
  it('registers and starts all four cron jobs when enabled', () => {
    const { service, registry } = setup(true);
    service.onModuleInit();
    const jobs = registry.getCronJobs();
    expect([...jobs.keys()].sort()).toEqual([...JOB_NAMES].sort());
    for (const job of jobs.values()) expect(job.isActive).toBe(true);
    for (const job of jobs.values()) void job.stop();
  });

  it('registers nothing when JOBS_SCHEDULER_ENABLED=false', () => {
    const { service, registry } = setup(false);
    service.onModuleInit();
    expect(registry.getCronJobs().size).toBe(0);
  });

  it('runs a job and skips a second run while the first is in flight', async () => {
    const { service, credits } = setup(false);
    let release!: () => void;
    credits.syncFromProvider.mockReturnValue(
      new Promise((resolve) => (release = () => resolve({ accounts: 1 }))),
    );

    const first = service.run('sync-credits');
    expect(await service.run('sync-credits')).toEqual({
      job: 'sync-credits',
      skipped: 'already running',
    });
    release();
    expect(await first).toEqual({ job: 'sync-credits', result: { accounts: 1 } });
  });
});

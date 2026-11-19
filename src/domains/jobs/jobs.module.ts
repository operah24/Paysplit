import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SalaryAccountModule } from '../salary-account/salary-account.module';
import { SplitEngineModule } from '../split-engine/split-engine.module';
import { JobsService } from './services/jobs.service';
import { JobsController } from './controllers/jobs.controller';
import { JobSecretGuard } from './guards/job-secret.guard';

@Module({
  imports: [ScheduleModule.forRoot(), SalaryAccountModule, SplitEngineModule],
  providers: [JobsService, JobSecretGuard],
  controllers: [JobsController],
})
export class JobsModule {}

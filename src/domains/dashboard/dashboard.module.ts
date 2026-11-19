import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IncomeModule } from '../income/income.module';
import { SplitRulesModule } from '../split-rules/split-rules.module';
import { WalletsModule } from '../wallets/wallets.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LedgerModule } from '../ledger/ledger.module';
import { SalaryAccountModule } from '../salary-account/salary-account.module';
import { DashboardService } from './services/dashboard.service';
import { DashboardController } from './controllers/dashboard.controller';

@Module({
  imports: [
    AuthModule,
    IncomeModule,
    SplitRulesModule,
    WalletsModule,
    NotificationsModule,
    LedgerModule,
    SalaryAccountModule,
  ],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}

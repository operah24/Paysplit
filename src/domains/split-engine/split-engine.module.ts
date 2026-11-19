import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { LedgerModule } from '../ledger/ledger.module';
import { IncomeModule } from '../income/income.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SalaryAccountModule } from '../salary-account/salary-account.module';
import { HepaidModule } from '../../integration/hepaid/hepaid.module';
import { LedgerTransaction } from '../ledger/entities/ledger-transaction.entity';
import { SplitRule } from '../split-rules/entities/split-rule.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { Beneficiary } from '../beneficiaries/entities/beneficiary.entity';
import { SalaryAccount } from '../salary-account/entities/salary-account.entity';
import { SplitRun } from './entities/split-run.entity';
import { PayoutService } from './services/payout.service';
import { SplitEngineService } from './services/split-engine.service';
import { CreditService } from './services/credit.service';
import { ReconciliationService } from './services/reconciliation.service';
import { SplitRunsController } from './controllers/split-runs.controller';
import { SalaryAccountController } from './controllers/salary-account.controller';

@Module({
  imports: [
    SequelizeModule.forFeature([
      SplitRun,
      LedgerTransaction,
      SplitRule,
      Wallet,
      Beneficiary,
      SalaryAccount,
    ]),
    AuthModule,
    UsersModule,
    LedgerModule,
    IncomeModule,
    NotificationsModule,
    SalaryAccountModule,
    HepaidModule,
  ],
  providers: [PayoutService, SplitEngineService, CreditService, ReconciliationService],
  controllers: [SplitRunsController, SalaryAccountController],
  exports: [PayoutService, SplitEngineService, CreditService, ReconciliationService],
})
export class SplitEngineModule {}

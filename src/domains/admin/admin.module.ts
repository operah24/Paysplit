import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { User } from '../users/entities/user.entity';
import { KycAttempt } from '../kyc/entities/kyc-attempt.entity';
import { SalaryProfile } from '../income/entities/salary-profile.entity';
import { LedgerTransaction } from '../ledger/entities/ledger-transaction.entity';
import { Beneficiary } from '../beneficiaries/entities/beneficiary.entity';
import { SplitRule } from '../split-rules/entities/split-rule.entity';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { LedgerModule } from '../ledger/ledger.module';
import { SalaryAccountModule } from '../salary-account/salary-account.module';
import { WalletsModule } from '../wallets/wallets.module';
import { BeneficiariesModule } from '../beneficiaries/beneficiaries.module';
import { SplitRulesModule } from '../split-rules/split-rules.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { AdminUsersService } from './services/admin-users.service';
import { AdminSalaryPaymentsService } from './services/admin-salary-payments.service';
import { AdminProfileService } from './services/admin-profile.service';
import { AdminAuthController } from './controllers/admin-auth.controller';
import { AdminOverviewController } from './controllers/admin-overview.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminMeController } from './controllers/admin-me.controller';

@Module({
  imports: [
    SequelizeModule.forFeature([
      User,
      KycAttempt,
      SalaryProfile,
      LedgerTransaction,
      Beneficiary,
      SplitRule,
    ]),
    AuthModule,
    AuditModule,
    LedgerModule,
    SalaryAccountModule,
    WalletsModule,
    BeneficiariesModule,
    SplitRulesModule,
    TransactionsModule,
  ],
  providers: [AdminUsersService, AdminSalaryPaymentsService, AdminProfileService],
  controllers: [
    AdminAuthController,
    AdminOverviewController,
    AdminUsersController,
    AdminMeController,
  ],
})
export class AdminModule {}

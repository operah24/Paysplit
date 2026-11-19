import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { LedgerModule } from '../ledger/ledger.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { HepaidModule } from '../../integration/hepaid/hepaid.module';
import { KycVerification } from '../kyc/entities/kyc-verification.entity';
import { KycCryptoService } from '../kyc/services/kyc-crypto.service';
import { SalaryAccount } from './entities/salary-account.entity';
import { SalaryAccountService } from './services/salary-account.service';
import { SalaryAccountProvisioningService } from './services/salary-account-provisioning.service';

@Module({
  imports: [
    SequelizeModule.forFeature([SalaryAccount, KycVerification]),
    LedgerModule,
    UsersModule,
    NotificationsModule,
    HepaidModule,
  ],
  providers: [SalaryAccountService, SalaryAccountProvisioningService, KycCryptoService],
  exports: [SalaryAccountService, SalaryAccountProvisioningService],
})
export class SalaryAccountModule {}

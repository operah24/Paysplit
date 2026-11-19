import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { KycVerification } from './entities/kyc-verification.entity';
import { KycAttempt } from './entities/kyc-attempt.entity';
import { KycVerificationRepository } from './repository/kyc-verification.repository';
import { KycAttemptRepository } from './repository/kyc-attempt.repository';
import { KycCryptoService } from './services/kyc-crypto.service';
import { KycService } from './services/kyc.service';
import { KycController } from './controllers/kyc.controller';
import { SalaryAccountIdentityController } from './controllers/salary-account-identity.controller';
import { KycApprovedGuard } from './guards/kyc-approved.guard';
import { AuthModule } from '../auth/auth.module';
import { DojahModule } from '../../integration/dojah/dojah.module';
import { EmailModule } from '../../integration/email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SalaryAccountModule } from '../salary-account/salary-account.module';

@Module({
  imports: [
    SequelizeModule.forFeature([KycVerification, KycAttempt]),
    AuthModule,
    DojahModule,
    EmailModule,
    NotificationsModule,
    SalaryAccountModule,
  ],
  providers: [
    KycVerificationRepository,
    KycAttemptRepository,
    KycCryptoService,
    KycService,
    KycApprovedGuard,
  ],
  controllers: [KycController, SalaryAccountIdentityController],
  exports: [KycService, KycApprovedGuard],
})
export class KycModule {}

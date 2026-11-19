import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Beneficiary } from './entities/beneficiary.entity';
import { SplitRule } from '../split-rules/entities/split-rule.entity';
import { BeneficiariesService } from './services/beneficiaries.service';
import { BankLookupService } from './services/bank-lookup.service';
import { BeneficiariesController } from './controllers/beneficiaries.controller';
import { AuthModule } from '../auth/auth.module';
import { CategoriesModule } from '../categories/categories.module';
import { IncomeModule } from '../income/income.module';
import { LedgerModule } from '../ledger/ledger.module';
import { HepaidModule } from '../../integration/hepaid/hepaid.module';

@Module({
  imports: [
    SequelizeModule.forFeature([Beneficiary, SplitRule]),
    AuthModule,
    CategoriesModule,
    IncomeModule,
    LedgerModule,
    HepaidModule,
  ],
  providers: [BeneficiariesService, BankLookupService],
  controllers: [BeneficiariesController],
  exports: [BeneficiariesService, BankLookupService],
})
export class BeneficiariesModule {}

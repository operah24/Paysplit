import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { SplitRule } from './entities/split-rule.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { Beneficiary } from '../beneficiaries/entities/beneficiary.entity';
import { SplitRulesService } from './services/split-rules.service';
import { SplitRulesController } from './controllers/split-rules.controller';
import { AuthModule } from '../auth/auth.module';
import { IncomeModule } from '../income/income.module';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [
    SequelizeModule.forFeature([SplitRule, Wallet, Beneficiary]),
    AuthModule,
    IncomeModule,
    LedgerModule,
  ],
  providers: [SplitRulesService],
  controllers: [SplitRulesController],
  exports: [SplitRulesService],
})
export class SplitRulesModule {}

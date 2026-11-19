import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { LedgerAccount } from './entities/ledger-account.entity';
import { LedgerTransaction } from './entities/ledger-transaction.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { LedgerService } from './services/ledger.service';
import { TransactionQueryService } from './services/transaction-query.service';

@Module({
  imports: [SequelizeModule.forFeature([LedgerAccount, LedgerTransaction, LedgerEntry])],
  providers: [LedgerService, TransactionQueryService],
  exports: [LedgerService, TransactionQueryService],
})
export class LedgerModule {}

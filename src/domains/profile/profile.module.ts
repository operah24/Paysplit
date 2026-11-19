import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../../integration/storage/storage.module';
import { ProfileImageService } from './services/profile-image.service';
import { ProfileService } from './services/profile.service';
import { IncomeModule } from '../income/income.module';
import { SalaryAccountModule } from '../salary-account/salary-account.module';
import { ProfileController } from './controllers/profile.controller';

@Module({
  imports: [AuthModule, StorageModule, IncomeModule, SalaryAccountModule],
  providers: [ProfileImageService, ProfileService],
  controllers: [ProfileController],
})
export class ProfileModule {}

import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { SalaryProfile } from './entities/salary-profile.entity';
import { IncomeService } from './services/income.service';
import { SetupEventsService } from './services/setup-events.service';
import { SetupController } from './controllers/setup.controller';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [SequelizeModule.forFeature([SalaryProfile]), AuthModule, NotificationsModule],
  providers: [IncomeService, SetupEventsService],
  controllers: [SetupController],
  exports: [IncomeService, SetupEventsService],
})
export class IncomeModule {}

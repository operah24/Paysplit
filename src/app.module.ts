import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { WinstonModule } from 'nest-winston';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { HttpLoggerMiddleware } from './shared/logger/http-logger.middleware';
import configuration from './config/configuration';
import { validationSchema } from './config/validation.schema';
import { getLoggerConfig } from './shared/logger/logger.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './domains/users/users.module';
import { AuthModule } from './domains/auth/auth.module';
import { KycModule } from './domains/kyc/kyc.module';
import { ProfileModule } from './domains/profile/profile.module';
import { CategoriesModule } from './domains/categories/categories.module';
import { LedgerModule } from './domains/ledger/ledger.module';
import { IncomeModule } from './domains/income/income.module';
import { WalletsModule } from './domains/wallets/wallets.module';
import { BeneficiariesModule } from './domains/beneficiaries/beneficiaries.module';
import { SplitRulesModule } from './domains/split-rules/split-rules.module';
import { TransactionsModule } from './domains/transactions/transactions.module';
import { DashboardModule } from './domains/dashboard/dashboard.module';
import { NotificationsModule } from './domains/notifications/notifications.module';
import { AdminModule } from './domains/admin/admin.module';
import { SalaryAccountModule } from './domains/salary-account/salary-account.module';
import { SplitEngineModule } from './domains/split-engine/split-engine.module';
import { JobsModule } from './domains/jobs/jobs.module';
import { WebhooksModule } from './domains/webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
    }),

    WinstonModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        getLoggerConfig(
          configService.get<string>('env', 'development'),
          configService.get<string>('betterstack.sourceToken', ''),
        ),
    }),

    SequelizeModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        dialect: 'postgres',
        host: configService.get<string>('database.host'),
        port: configService.get<number>('database.port'),
        username: configService.get<string>('database.username'),
        password: configService.get<string>('database.password'),
        database: configService.get<string>('database.name'),
        autoLoadModels: true,
        synchronize: false,

        logging: process.env.DB_LOGGING === 'true' ? console.log : false,
        dialectOptions: configService.get<boolean>('database.ssl')
          ? { ssl: { require: true, rejectUnauthorized: false } }
          : {},
      }),
    }),

    ThrottlerModule.forRoot({
      errorMessage: 'Too many requests, please try again later',
      throttlers: [
        {
          ttl: 60000,
          limit: 1000,
        },
      ],
    }),

    UsersModule,
    AuthModule,
    KycModule,
    ProfileModule,
    CategoriesModule,
    LedgerModule,
    IncomeModule,
    WalletsModule,
    BeneficiariesModule,
    SplitRulesModule,
    TransactionsModule,
    DashboardModule,
    NotificationsModule,
    AdminModule,
    SalaryAccountModule,
    SplitEngineModule,
    JobsModule,
    WebhooksModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpLoggerMiddleware).forRoutes('*');
  }
}

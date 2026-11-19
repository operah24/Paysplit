import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Otp } from './entities/otp.entity';
import { OtpRepository } from './repository/otp.repository';
import { OtpService } from './services/otp.service';
import { TokenService } from './services/token.service';
import { AuthService } from './services/auth.service';
import { AuthController } from './controllers/auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SetupTokenGuard } from './guards/setup-token.guard';
import { EmailModule } from '../../integration/email/email.module';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [SequelizeModule.forFeature([Otp]), UsersModule, EmailModule, AuditModule],
  providers: [OtpRepository, OtpService, TokenService, AuthService, JwtAuthGuard, SetupTokenGuard],
  controllers: [AuthController],

  exports: [AuthService, TokenService, JwtAuthGuard, UsersModule, AuditModule],
})
export class AuthModule {}

import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AdminAuditLog } from './entities/admin-audit-log.entity';
import { AdminAuditService } from './services/admin-audit.service';

@Module({
  imports: [SequelizeModule.forFeature([AdminAuditLog])],
  providers: [AdminAuditService],
  exports: [AdminAuditService],
})
export class AuditModule {}

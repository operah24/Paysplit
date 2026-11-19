import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { CreationAttributes } from 'sequelize';
import { AdminAuditLog } from '../entities/admin-audit-log.entity';
import { AdminAuditAction } from '../constants/audit.constants';
import type { RequestMeta } from '../../../shared/decorators/request-meta.decorator';

export interface AdminAuditInput {
  adminId: string;
  action: AdminAuditAction;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  meta?: RequestMeta;
}

@Injectable()
export class AdminAuditService {
  constructor(@InjectModel(AdminAuditLog) private readonly logs: typeof AdminAuditLog) {}

  async record(input: AdminAuditInput): Promise<void> {
    await this.logs.create({
      adminId: input.adminId,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metadata: input.metadata ?? null,
      ipAddress: input.meta?.ip ?? null,
      userAgent: input.meta?.userAgent ?? null,
    } as CreationAttributes<AdminAuditLog>);
  }
}

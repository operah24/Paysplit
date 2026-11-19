import {
  Table,
  Column,
  DataType,
  Model,
  PrimaryKey,
  Default,
  ForeignKey,
  BelongsTo,
  CreatedAt,
} from 'sequelize-typescript';
import { User } from '../../users/entities/user.entity';
import type { AdminAuditAction } from '../constants/audit.constants';

@Table({ tableName: 'admin_audit_logs', updatedAt: false })
export class AdminAuditLog extends Model<AdminAuditLog> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, field: 'admin_id' })
  declare adminId: string;

  @BelongsTo(() => User)
  declare admin?: User;

  @Column({ type: DataType.STRING(60), allowNull: false })
  declare action: AdminAuditAction;

  @Column({ type: DataType.STRING(40), allowNull: true, field: 'target_type' })
  declare targetType: string | null;

  @Column({ type: DataType.UUID, allowNull: true, field: 'target_id' })
  declare targetId: string | null;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare metadata: Record<string, unknown> | null;

  @Column({ type: DataType.STRING(64), allowNull: true, field: 'ip_address' })
  declare ipAddress: string | null;

  @Column({ type: DataType.STRING(512), allowNull: true, field: 'user_agent' })
  declare userAgent: string | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;
}

import {
  Table,
  Column,
  DataType,
  Model,
  PrimaryKey,
  Default,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';

export type WebhookEventStatus = 'received' | 'processed' | 'ignored' | 'failed';

@Table({ tableName: 'webhook_events' })
export class WebhookEvent extends Model<WebhookEvent> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.STRING(20), allowNull: false })
  declare provider: string;

  @Column({ type: DataType.STRING(100), allowNull: false, field: 'event_id' })
  declare eventId: string;

  @Column({ type: DataType.STRING(60), allowNull: false })
  declare type: string;

  @Column({ type: DataType.STRING(10), allowNull: true })
  declare mode: string | null;

  @Column({ type: DataType.STRING(20), allowNull: false })
  declare status: WebhookEventStatus;

  @Column({ type: DataType.STRING(300), allowNull: true })
  declare note: string | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare attempts: number;

  @Column({ type: DataType.DATE, allowNull: true, field: 'processed_at' })
  declare processedAt: Date | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}

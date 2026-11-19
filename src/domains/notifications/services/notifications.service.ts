import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { ConfigService } from '@nestjs/config';
import { CreationAttributes, Op, WhereOptions } from 'sequelize';
import { Notification } from '../entities/notification.entity';
import { User } from '../../users/entities/user.entity';
import { EmailService } from '../../../integration/email/email.service';
import {
  NotificationTopic,
  resolveNotificationPreferences,
} from '../../users/constants/notification-preferences.constants';
import { PaginatedResult } from '../../../shared/utils/pagination.utils';
import { AppError } from '../../../shared/utils/app-error.util';

export interface NotifyInput {
  type: string;

  topic: NotificationTopic;
  title: string;
  body: string;
  data?: Record<string, unknown>;

  actionUrl?: string;

  email?: boolean;
}

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read: boolean;
  readAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly appUrl: string;

  constructor(
    @InjectModel(Notification) private readonly notifications: typeof Notification,
    private readonly emailService: EmailService,
    configService: ConfigService,
  ) {
    this.appUrl = configService.get<string>('app.webUrl', '').replace(/\/+$/, '');
  }

  async notify(user: User, input: NotifyInput): Promise<void> {
    try {
      await this.notifications.create({
        userId: user.id,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data ?? null,
      } as CreationAttributes<Notification>);

      const prefs = resolveNotificationPreferences(user.notificationPreferences);
      if (input.email && prefs.email[input.topic]) {
        await this.emailService.send({
          to: user.email,
          subject: input.title,
          template: 'generic-notification',
          data: {
            firstName: user.firstName,
            title: input.title,
            body: input.body,
            actionUrl: input.actionUrl ?? null,
            appUrl: this.appUrl,
          },
        });
      }
    } catch (error) {
      this.logger.warn(
        `Notification "${input.type}" for ${user.id} failed: ${(error as Error).message}`,
      );
    }
  }

  async exists(userId: string, type: string): Promise<boolean> {
    return (await this.notifications.count({ where: { userId, type } })) > 0;
  }

  async list(
    userId: string,
    options: { page: number; limit: number; unreadOnly?: boolean },
  ): Promise<PaginatedResult<NotificationView> & { unreadCount: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, options.limit || 10);
    const where: WhereOptions<Notification> = options.unreadOnly
      ? { userId, readAt: { [Op.is]: null } }
      : { userId };

    const [{ count, rows }, unreadCount] = await Promise.all([
      this.notifications.findAndCountAll({
        where,
        order: [['createdAt', 'DESC']],
        limit,
        offset: (page - 1) * limit,
      }),
      this.unreadCount(userId),
    ]);

    return {
      data: rows.map((row) => NotificationsService.toView(row)),
      pagination: { total: count, page, limit, pages: Math.ceil(count / limit) },
      unreadCount,
    };
  }

  unreadCount(userId: string): Promise<number> {
    return this.notifications.count({ where: { userId, readAt: { [Op.is]: null } } });
  }

  async markRead(userId: string, id: string): Promise<NotificationView> {
    const row = await this.notifications.findOne({ where: { id, userId } });
    if (!row) throw AppError.notFound('NOTIFICATION_NOT_FOUND', 'Notification not found.');
    if (!row.readAt) await row.update({ readAt: new Date() });
    return NotificationsService.toView(row);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const [updated] = await this.notifications.update(
      { readAt: new Date() },
      { where: { userId, readAt: { [Op.is]: null } } },
    );
    return { updated };
  }

  static toView(row: Notification): NotificationView {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      data: row.data,
      read: !!row.readAt,
      readAt: row.readAt,
      createdAt: row.createdAt,
    };
  }
}

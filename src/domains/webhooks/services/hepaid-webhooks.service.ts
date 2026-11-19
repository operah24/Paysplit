import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { CreationAttributes, UniqueConstraintError } from 'sequelize';
import {
  HepaidTransfer,
  HepaidWalletCreditedData,
  HepaidWebhookEvent,
} from '../../../integration/hepaid/hepaid.types';
import { CreditService } from '../../split-engine/services/credit.service';
import { PayoutService } from '../../split-engine/services/payout.service';
import { WebhookEvent, WebhookEventStatus } from '../entities/webhook-event.entity';
import { verifyHepaidSignature } from '../utils/hepaid-signature';

const PROVIDER = 'hepaid';
const TRANSFER_EVENTS = new Set(['transfer.succeeded', 'transfer.failed', 'transfer.reversed']);

export interface ReceivedWebhook {
  event: HepaidWebhookEvent;
  record: WebhookEvent;

  duplicate: boolean;
}

@Injectable()
export class HepaidWebhooksService {
  private readonly logger = new Logger(HepaidWebhooksService.name);
  private readonly secret: string;

  constructor(
    configService: ConfigService,
    private readonly credits: CreditService,
    private readonly payouts: PayoutService,
    @InjectModel(WebhookEvent) private readonly events: typeof WebhookEvent,
  ) {
    this.secret = configService.get<string>('hepaid.webhookSecret', '');
  }

  async receive(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Promise<ReceivedWebhook> {
    if (!this.secret) {
      throw new ServiceUnavailableException('Webhooks are not configured');
    }
    if (!rawBody || !verifyHepaidSignature(rawBody, signature, this.secret)) {
      this.logger.warn('Rejected HePaid webhook with an invalid signature');
      throw new BadRequestException('Invalid signature');
    }

    let event: HepaidWebhookEvent;
    try {
      event = JSON.parse(rawBody.toString('utf8')) as HepaidWebhookEvent;
    } catch {
      throw new BadRequestException('Invalid JSON');
    }
    if (!event?.id || !event.type) throw new BadRequestException('Invalid event');

    const existing = await this.events.findOne({
      where: { provider: PROVIDER, eventId: event.id },
    });
    if (existing) {
      return { event, record: existing, duplicate: existing.status !== 'failed' };
    }
    try {
      const record = await this.events.create({
        provider: PROVIDER,
        eventId: event.id,
        type: event.type.slice(0, 60),
        mode: event.mode ?? null,
        status: 'received',
      } as CreationAttributes<WebhookEvent>);
      return { event, record, duplicate: false };
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        const record = await this.events.findOne({
          where: { provider: PROVIDER, eventId: event.id },
        });
        return { event, record: record!, duplicate: true };
      }
      throw error;
    }
  }

  async process(event: HepaidWebhookEvent, record: WebhookEvent): Promise<void> {
    let status: WebhookEventStatus = 'processed';
    let note: string | null = null;
    try {
      if (event.type === 'ping') {
        status = 'ignored';
        note = 'ping';
      } else if (event.type === 'wallet.credited') {
        const reference = (event.data as HepaidWalletCreditedData)?.wallet?.reference;
        const recorded = reference ? await this.credits.syncWallet(reference) : null;
        if (recorded === null) {
          status = 'ignored';
          note = 'not one of our active salary accounts';
        } else {
          note = `${recorded} credit(s) recorded`;
        }
      } else if (TRANSFER_EVENTS.has(event.type)) {
        const reference = (event.data as HepaidTransfer)?.reference;
        const found = reference ? await this.payouts.syncByReference(reference) : false;
        if (!found) {
          status = 'ignored';
          note = 'not one of our payouts';
        }
      } else {
        status = 'ignored';
        note = 'event type not used';
      }
    } catch (error) {
      status = 'failed';
      note = (error as Error).message;
      this.logger.error(`HePaid webhook ${event.type} (${event.id}) failed: ${note}`);
    }

    await record.update({
      status,
      note: note?.slice(0, 300) ?? null,
      attempts: record.attempts + 1,
      processedAt: new Date(),
    });
  }
}

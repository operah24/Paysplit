import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { SplitEngineModule } from '../split-engine/split-engine.module';
import { WebhookEvent } from './entities/webhook-event.entity';
import { HepaidWebhooksService } from './services/hepaid-webhooks.service';
import { HepaidWebhooksController } from './controllers/hepaid-webhooks.controller';

@Module({
  imports: [SequelizeModule.forFeature([WebhookEvent]), SplitEngineModule],
  providers: [HepaidWebhooksService],
  controllers: [HepaidWebhooksController],
})
export class WebhooksModule {}

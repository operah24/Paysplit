import { Controller, Headers, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { HepaidWebhooksService } from '../services/hepaid-webhooks.service';

@ApiTags('webhooks')
@SkipThrottle()
@Controller('webhooks')
export class HepaidWebhooksController {
  constructor(private readonly webhooks: HepaidWebhooksService) {}

  @Post('hepaid')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async hepaid(
    @Req() req: RawBodyRequest<Request>,
    @Headers('hepaid-signature') signature?: string,
  ) {
    const { event, record, duplicate } = await this.webhooks.receive(req.rawBody, signature);

    if (!duplicate) void this.webhooks.process(event, record);
    return { received: true, duplicate };
  }
}

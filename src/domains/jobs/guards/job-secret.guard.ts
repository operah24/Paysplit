import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

const digest = (value: string) => createHash('sha256').update(value).digest();

@Injectable()
export class JobSecretGuard implements CanActivate {
  private readonly secret: string;

  constructor(configService: ConfigService) {
    this.secret = configService.get<string>('jobs.secret', '');
  }

  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<Request>().header('x-job-secret') ?? '';

    if (!this.secret || !timingSafeEqual(digest(header), digest(this.secret))) {
      throw new NotFoundException();
    }
    return true;
  }
}

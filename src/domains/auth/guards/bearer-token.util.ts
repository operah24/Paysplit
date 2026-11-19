import { UnauthorizedException } from '@nestjs/common';

export function extractBearerToken(authorization?: string): string {
  if (!authorization || !authorization.startsWith('Bearer ')) {
    throw new UnauthorizedException('Missing or invalid Authorization header');
  }
  return authorization.slice('Bearer '.length).trim();
}

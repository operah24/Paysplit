import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

const MAX_USER_AGENT = 512;

const firstHeader = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export function requestMetaFrom(request: RequestLike): RequestMeta {
  const forwarded = firstHeader(request.headers['x-forwarded-for'])?.split(',')[0]?.trim();
  const userAgent = firstHeader(request.headers['user-agent']);
  return {
    ip: forwarded || request.ip || null,
    userAgent: userAgent ? userAgent.slice(0, MAX_USER_AGENT) : null,
  };
}

export const ReqMeta = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestMeta =>
  requestMetaFrom(ctx.switchToHttp().getRequest<RequestLike>()),
);

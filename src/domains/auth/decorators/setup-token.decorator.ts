import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TokenPayload } from '../services/token.service';

export const SetupToken = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TokenPayload =>
    ctx.switchToHttp().getRequest<{ setupToken: TokenPayload }>().setupToken,
);

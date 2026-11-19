import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../../users/services/users.service';
import { User } from '../../users/entities/user.entity';
import { TokenService } from '../services/token.service';
import { extractBearerToken } from './bearer-token.util';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: { authorization?: string }; user?: User }>();

    const payload = this.tokenService.verify(
      extractBearerToken(request.headers.authorization),
      'access',
    );
    if (!payload) {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }

    const user = await this.usersService.findById(payload.id);
    if (!user || !user.isActive || user.deactivatedAt) {
      throw new UnauthorizedException('User is inactive or no longer exists');
    }

    if ((payload.ver ?? 0) !== (user.tokenVersion ?? 0)) {
      throw new UnauthorizedException('Your session has ended. Please sign in again.');
    }

    request.user = user;
    return true;
  }
}

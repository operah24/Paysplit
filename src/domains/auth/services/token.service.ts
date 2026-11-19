import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

export type TokenPurpose = 'access' | 'password_setup';

export interface TokenPayload {
  id: string;
  email: string;
  purpose: TokenPurpose;

  ver?: number;
}

export interface SignedToken {
  token: string;

  expiresIn: number;
}

@Injectable()
export class TokenService {
  private readonly secret: string;

  constructor(private readonly configService: ConfigService) {
    this.secret = configService.getOrThrow<string>('jwt.secret');
  }

  signAccessToken(
    user: { id: string; email: string; tokenVersion?: number },
    rememberMe = false,
  ): SignedToken {
    const expiresIn = rememberMe
      ? this.configService.get<string>('jwt.rememberMeExpiresIn', '30d')
      : this.configService.get<string>('jwt.expiresIn', '24h');
    return this.sign(
      { id: user.id, email: user.email, purpose: 'access', ver: user.tokenVersion ?? 0 },
      expiresIn,
    );
  }

  signPasswordSetupToken(user: { id: string; email: string }): SignedToken {
    const expiresIn = this.configService.get<string>('jwt.setupTokenExpiresIn', '15m');
    return this.sign({ id: user.id, email: user.email, purpose: 'password_setup' }, expiresIn);
  }

  verify(token: string, purpose: TokenPurpose): TokenPayload | null {
    try {
      const payload = jwt.verify(token, this.secret) as Partial<TokenPayload>;
      if (payload.purpose !== purpose || !payload.id || !payload.email) return null;
      return payload as TokenPayload;
    } catch {
      return null;
    }
  }

  private sign(payload: TokenPayload, expiresIn: string): SignedToken {
    const token = jwt.sign(payload, this.secret, {
      expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
    });
    const { iat, exp } = jwt.decode(token) as { iat: number; exp: number };
    return { token, expiresIn: exp - iat };
  }
}

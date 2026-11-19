import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { User } from '../../users/entities/user.entity';
import { KYC_ERROR_CODES } from '../constants/kyc.constants';

@Injectable()
export class KycApprovedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{ user?: User }>().user;

    if (user?.kycStatus !== 'approved') {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: KYC_ERROR_CODES.KYC_REQUIRED,
        message: 'Complete identity verification (KYC) to use this feature.',
      });
    }
    return true;
  }
}

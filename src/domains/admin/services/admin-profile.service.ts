import { Injectable } from '@nestjs/common';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { User } from '../../users/entities/user.entity';
import { ROLES, UsersService } from '../../users/services/users.service';
import { UserWriteInput } from '../../users/repository/user.repository';
import { AdminAuditService } from '../../audit/services/admin-audit.service';
import { ADMIN_AUDIT_ACTIONS } from '../../audit/constants/audit.constants';
import { UpdateAdminProfileDto } from '../dtos/admin.dtos';
import { ADMIN_ERROR_CODES } from './admin-users.service';
import { AppError } from '../../../shared/utils/app-error.util';
import type { RequestMeta } from '../../../shared/decorators/request-meta.decorator';

const DEFAULT_PHONE_REGION: CountryCode = 'NG';

const ROLE_LABELS: Record<string, string> = {
  [ROLES.SUPER_ADMIN]: 'Super Admin',
  [ROLES.ADMIN]: 'Admin',
};

export interface AdminProfile {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;

  email: string;
  phoneNumber: string | null;
  profileImageUrl: string | null;
  role: string | null;

  roleLabel: string;
  createdAt: Date;
  lastLoginAt: Date | null;

  passwordUpdatedAt: Date | null;
}

@Injectable()
export class AdminProfileService {
  constructor(
    private readonly usersService: UsersService,
    private readonly audit: AdminAuditService,
  ) {}

  get(admin: User): AdminProfile {
    const role = admin.role?.name ?? null;
    return {
      id: admin.id,
      firstName: admin.firstName,
      lastName: admin.lastName,
      fullName: `${admin.firstName} ${admin.lastName}`.trim(),
      email: admin.email,
      phoneNumber: admin.phoneNumber ?? null,
      profileImageUrl: admin.profileImageUrl ?? null,
      role,
      roleLabel: (role && ROLE_LABELS[role]) || 'Admin',
      createdAt: admin.createdAt,
      lastLoginAt: admin.lastLoginAt ?? null,
      passwordUpdatedAt: admin.passwordSetAt ?? null,
    };
  }

  async update(admin: User, dto: UpdateAdminProfileDto, meta: RequestMeta): Promise<AdminProfile> {
    const changes: UserWriteInput = {};
    if (dto.firstName !== undefined && dto.firstName !== admin.firstName) {
      changes.firstName = dto.firstName;
    }
    if (dto.lastName !== undefined && dto.lastName !== admin.lastName) {
      changes.lastName = dto.lastName;
    }
    if (dto.phoneNumber !== undefined) {
      const region = (admin.countryCode as CountryCode | null) ?? DEFAULT_PHONE_REGION;
      const phone = parsePhoneNumberFromString(dto.phoneNumber, region);
      if (!phone || !phone.isValid()) {
        throw AppError.unprocessable(
          ADMIN_ERROR_CODES.INVALID_PHONE,
          'Enter a valid phone number.',
        );
      }
      if (phone.number !== admin.phoneNumber) changes.phoneNumber = phone.number;
    }

    const fields = Object.keys(changes);
    if (!fields.length) return this.get(admin);

    await this.usersService.update(admin.id, changes);

    await this.audit.record({
      adminId: admin.id,
      action: ADMIN_AUDIT_ACTIONS.PROFILE_UPDATED,
      metadata: { fields },
      meta,
    });

    const fresh = (await this.usersService.findById(admin.id)) ?? admin;
    return this.get(fresh);
  }
}

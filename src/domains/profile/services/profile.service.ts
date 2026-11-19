import { Injectable } from '@nestjs/common';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/services/users.service';
import { UserWriteInput } from '../../users/repository/user.repository';
import { OnboardingStatus } from '../../users/utils/onboarding-status';
import { IncomeService, IncomeView } from '../../income/services/income.service';
import {
  SalaryAccountService,
  SalaryAccountView,
  userTier,
} from '../../salary-account/services/salary-account.service';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TOPICS,
  NotificationPreferences,
  resolveNotificationPreferences,
} from '../../users/constants/notification-preferences.constants';
import { UpdateNotificationPreferencesDto, UpdateProfileDto } from '../dtos/profile.dtos';
import { AppError } from '../../../shared/utils/app-error.util';

export const PROFILE_ERROR_CODES = {
  NAME_LOCKED: 'NAME_LOCKED',
  INVALID_PHONE: 'INVALID_PHONE',
} as const;

export interface ProfileResponse {
  user: Record<string, unknown>;

  accountId: string;
  memberSince: Date;
  tier: 1 | 2;

  namesLocked: boolean;
  salaryAccount: SalaryAccountView;
  income: IncomeView | null;
  security: { passwordLastUpdated: Date | null };
  notificationPreferences: NotificationPreferencesResponse;
  onboarding: OnboardingStatus;
}

export interface NotificationPreferencesResponse {
  preferences: NotificationPreferences;

  topics: typeof NOTIFICATION_TOPICS;

  deliveredChannels: string[];
}

@Injectable()
export class ProfileService {
  constructor(
    private readonly usersService: UsersService,
    private readonly income: IncomeService,
    private readonly salaryAccount: SalaryAccountService,
  ) {}

  async get(user: User): Promise<ProfileResponse> {
    const [income, salaryAccount, onboarding] = await Promise.all([
      this.income.get(user.id),
      this.salaryAccount.getView(user),
      this.usersService.getOnboardingStatus(user),
    ]);
    return {
      user: user.toJSON(),
      accountId: ProfileService.accountId(user.id),
      memberSince: user.createdAt,
      tier: userTier(user),
      namesLocked: user.kycStatus === 'approved',
      salaryAccount,
      income,
      security: { passwordLastUpdated: user.passwordSetAt ?? null },
      notificationPreferences: ProfileService.preferencesResponse(user),
      onboarding,
    };
  }

  async update(user: User, dto: UpdateProfileDto): Promise<ProfileResponse> {
    const changes: UserWriteInput = {};
    const nameChanged =
      (dto.firstName !== undefined && dto.firstName !== user.firstName) ||
      (dto.lastName !== undefined && dto.lastName !== user.lastName);

    if (nameChanged) {
      if (user.kycStatus === 'approved') {
        throw AppError.conflict(
          PROFILE_ERROR_CODES.NAME_LOCKED,
          'Your name is verified against your ID and can no longer be changed. Contact support if it is wrong.',
        );
      }
      if (dto.firstName !== undefined) changes.firstName = dto.firstName;
      if (dto.lastName !== undefined) changes.lastName = dto.lastName;
    }

    if (dto.phoneNumber !== undefined) {
      const country = (user.countryCode ?? undefined) as CountryCode | undefined;
      const phone = parsePhoneNumberFromString(dto.phoneNumber, country);
      if (!phone || !phone.isValid()) {
        throw AppError.unprocessable(
          PROFILE_ERROR_CODES.INVALID_PHONE,
          country
            ? 'Enter a valid phone number.'
            : 'Enter a valid phone number in international format (e.g. +2348031234567).',
        );
      }
      changes.phoneNumber = phone.number;
    }

    if (Object.keys(changes).length) await this.usersService.update(user.id, changes);
    const fresh = (await this.usersService.findById(user.id)) ?? user;
    return this.get(fresh);
  }

  getPreferences(user: User): NotificationPreferencesResponse {
    return ProfileService.preferencesResponse(user);
  }

  async updatePreferences(
    user: User,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesResponse> {
    const current = resolveNotificationPreferences(user.notificationPreferences);
    for (const channel of NOTIFICATION_CHANNELS) {
      const patch = dto[channel];
      if (!patch) continue;
      for (const [topic, enabled] of Object.entries(patch)) {
        if (typeof enabled === 'boolean' && topic in NOTIFICATION_TOPICS) {
          current[channel][topic as keyof typeof NOTIFICATION_TOPICS] = enabled;
        }
      }
    }
    await this.usersService.update(user.id, { notificationPreferences: current });
    return {
      preferences: current,
      topics: NOTIFICATION_TOPICS,
      deliveredChannels: ['email'],
    };
  }

  private static preferencesResponse(user: User): NotificationPreferencesResponse {
    return {
      preferences: resolveNotificationPreferences(user.notificationPreferences),
      topics: NOTIFICATION_TOPICS,
      deliveredChannels: ['email'],
    };
  }

  static accountId(userId: string): string {
    return `USER${userId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  }
}

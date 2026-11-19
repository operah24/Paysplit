import { HttpException } from '@nestjs/common';
import { ProfileService, PROFILE_ERROR_CODES } from './profile.service';
import { UsersService } from '../../users/services/users.service';
import { IncomeService } from '../../income/services/income.service';
import { SalaryAccountService } from '../../salary-account/services/salary-account.service';
import { User } from '../../users/entities/user.entity';

const makeUser = (overrides: Partial<User> = {}) => {
  const data = {
    id: '0842196a-1111-4222-8333-444455556666',
    email: 'paul@paysplit.com',
    firstName: 'Paul',
    lastName: 'Clarke',
    countryCode: 'NG',
    kycStatus: 'not_started',
    notificationPreferences: null,
    createdAt: new Date('2024-01-10'),
    passwordSetAt: new Date('2024-04-24'),
    ...overrides,
  };
  return { ...data, toJSON: () => data } as unknown as User;
};

describe('ProfileService', () => {
  let users: { update: jest.Mock; findById: jest.Mock; getOnboardingStatus: jest.Mock };
  let service: ProfileService;

  beforeEach(() => {
    users = {
      update: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
      getOnboardingStatus: jest.fn().mockResolvedValue({ nextStep: 'kyc' }),
    };
    service = new ProfileService(
      users as unknown as UsersService,
      { get: jest.fn().mockResolvedValue(null) } as unknown as IncomeService,
      {
        getView: jest.fn().mockResolvedValue({ status: 'not_issued', balance: 0 }),
      } as unknown as SalaryAccountService,
    );
  });

  it('builds the profile screen with a readable account ID', async () => {
    const user = makeUser();
    const profile = await service.get(user);
    expect(profile.accountId).toBe('USER0842196A');
    expect(profile.tier).toBe(1);
    expect(profile.namesLocked).toBe(false);
    expect(profile.security.passwordLastUpdated).toEqual(new Date('2024-04-24'));
    expect(profile.notificationPreferences.preferences.email.salaryReceived).toBe(true);
  });

  it('normalises the phone number to international format for the user’s country', async () => {
    const user = makeUser();
    users.findById.mockResolvedValue(user);
    await service.update(user, { phoneNumber: '0803 123 4567' });
    expect(users.update).toHaveBeenCalledWith(user.id, { phoneNumber: '+2348031234567' });
  });

  it('rejects invalid phone numbers', async () => {
    await expect(service.update(makeUser(), { phoneNumber: '12' })).rejects.toMatchObject({
      response: { code: PROFILE_ERROR_CODES.INVALID_PHONE },
    });
  });

  it('locks names after KYC approval, but still allows sending the same name', async () => {
    const user = makeUser({ kycStatus: 'approved' });
    users.findById.mockResolvedValue(user);

    await expect(service.update(user, { firstName: 'Pauline' })).rejects.toBeInstanceOf(
      HttpException,
    );
    await service.update(user, { firstName: 'Paul', lastName: 'Clarke' });
    expect(users.update).not.toHaveBeenCalled();
  });

  it('merges partial notification preference updates', async () => {
    const user = makeUser();
    const result = await service.updatePreferences(user, { sms: { splitCompleted: true } });
    expect(result.preferences.sms.splitCompleted).toBe(true);
    expect(result.preferences.email.salaryReceived).toBe(true);
    expect(users.update).toHaveBeenCalledWith(user.id, {
      notificationPreferences: result.preferences,
    });
  });
});

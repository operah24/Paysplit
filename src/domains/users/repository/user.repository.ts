import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { CreationAttributes } from 'sequelize';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';
import { KycVerification } from '../../kyc/entities/kyc-verification.entity';

export type UserWriteInput = Partial<
  Pick<
    User,
    | 'email'
    | 'firstName'
    | 'lastName'
    | 'password'
    | 'phoneNumber'
    | 'countryCode'
    | 'currencyCode'
    | 'profileImageUrl'
    | 'isEmailVerified'
    | 'passwordSetAt'
    | 'kycStatus'
    | 'isActive'
    | 'roleId'
    | 'lastLoginAt'
    | 'deactivatedAt'
    | 'notificationPreferences'
  >
>;

@Injectable()
export class UserRepository {
  constructor(
    @InjectModel(User)
    private readonly userModel: typeof User,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.userModel.findByPk(id, { include: [Role, KycVerification] });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ where: { email }, include: [Role, KycVerification] });
  }

  create(data: UserWriteInput): Promise<User> {
    return this.userModel.create(data as CreationAttributes<User>);
  }

  async update(id: string, data: UserWriteInput): Promise<void> {
    await this.userModel.update(data, { where: { id } });
  }

  async incrementTokenVersion(id: string): Promise<void> {
    await this.userModel.increment('tokenVersion', { by: 1, where: { id } });
  }
}

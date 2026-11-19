import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { CreationAttributes } from 'sequelize';
import { Otp } from '../entities/otp.entity';

@Injectable()
export class OtpRepository {
  constructor(
    @InjectModel(Otp)
    private readonly otpModel: typeof Otp,
  ) {}

  async deleteByEmailAndType(email: string, type: string): Promise<void> {
    await this.otpModel.destroy({ where: { email, type }, force: true });
  }

  create(data: {
    email: string;
    codeHash: string;
    type: string;
    otpExpiresAt: Date;
  }): Promise<Otp> {
    return this.otpModel.create(data as CreationAttributes<Otp>);
  }

  findLatest(email: string, type: string): Promise<Otp | null> {
    return this.otpModel.findOne({ where: { email, type }, order: [['createdAt', 'DESC']] });
  }

  findVerified(email: string, type: string): Promise<Otp | null> {
    return this.otpModel.findOne({
      where: { email, type, isVerified: true },
      order: [['createdAt', 'DESC']],
    });
  }

  async incrementAttempts(id: string): Promise<void> {
    await this.otpModel.increment('attempts', { where: { id } });
  }

  async markAsVerified(id: string): Promise<void> {
    await this.otpModel.update({ isVerified: true }, { where: { id } });
  }

  async deleteById(id: string): Promise<void> {
    await this.otpModel.destroy({ where: { id }, force: true });
  }
}

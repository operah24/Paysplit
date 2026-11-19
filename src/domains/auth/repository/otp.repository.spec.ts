import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { OtpRepository } from './otp.repository';
import { Otp } from '../entities/otp.entity';

describe('OtpRepository', () => {
  let repository: OtpRepository;
  let model: Record<string, jest.Mock>;

  beforeEach(async () => {
    model = {
      create: jest.fn(),
      findOne: jest.fn(),
      destroy: jest.fn(),
      update: jest.fn(),
      increment: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [OtpRepository, { provide: getModelToken(Otp), useValue: model }],
    }).compile();

    repository = module.get(OtpRepository);
  });

  it('hard-deletes all codes for an email + type', async () => {
    await repository.deleteByEmailAndType('paul@paysplit.com', 'registration');
    expect(model.destroy).toHaveBeenCalledWith({
      where: { email: 'paul@paysplit.com', type: 'registration' },
      force: true,
    });
  });

  it('finds the latest code for an email + type', async () => {
    await repository.findLatest('paul@paysplit.com', 'registration');
    expect(model.findOne).toHaveBeenCalledWith({
      where: { email: 'paul@paysplit.com', type: 'registration' },
      order: [['createdAt', 'DESC']],
    });
  });

  it('finds only verified codes', async () => {
    await repository.findVerified('paul@paysplit.com', 'password-reset');
    expect(model.findOne).toHaveBeenCalledWith({
      where: { email: 'paul@paysplit.com', type: 'password-reset', isVerified: true },
      order: [['createdAt', 'DESC']],
    });
  });

  it('increments attempts atomically', async () => {
    await repository.incrementAttempts('otp-1');
    expect(model.increment).toHaveBeenCalledWith('attempts', { where: { id: 'otp-1' } });
  });

  it('marks a single code as verified', async () => {
    await repository.markAsVerified('otp-1');
    expect(model.update).toHaveBeenCalledWith({ isVerified: true }, { where: { id: 'otp-1' } });
  });
});

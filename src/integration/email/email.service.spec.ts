import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { EmailService, htmlToText } from './email.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

const smtpConfig: Record<string, unknown> = {
  'smtp.host': 'smtp.zeptomail.com',
  'smtp.port': 587,
  'smtp.user': 'emailapikey',
  'smtp.pass': 'secret',
  'smtp.from': 'noreply@talentnation.ai',
  'email.fromName': 'PaySplit | Salary Autopilot',
  env: 'development',
};

const makeService = (overrides: Record<string, unknown> = {}) => {
  const values = { ...smtpConfig, ...overrides };
  return new EmailService({
    get: (key: string, fallback?: unknown) => (key in values ? values[key] : fallback),
  } as unknown as ConfigService);
};

describe('EmailService', () => {
  let sendMail: jest.Mock;
  const sentMail = () => (sendMail.mock.calls as Record<string, string>[][])[0][0];

  beforeEach(() => {
    sendMail = jest.fn().mockResolvedValue({ messageId: 'id' });
    (createTransport as jest.Mock).mockReset().mockReturnValue({
      sendMail,
      verify: jest.fn().mockResolvedValue(true),
    });
  });

  it('configures STARTTLS on port 587', () => {
    makeService();
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.zeptomail.com',
        port: 587,
        secure: false,
        requireTLS: true,
        auth: { user: 'emailapikey', pass: 'secret' },
      }),
    );
  });

  it('uses implicit TLS on port 465', () => {
    makeService({ 'smtp.port': 465 });
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ secure: true, requireTLS: false }),
    );
  });

  it('sends the rendered verification email with a branded sender and text alternative', async () => {
    const service = makeService();
    await service.sendEmailVerificationCode('paul@paysplit.com', '184269', 'Paul', 10);

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sentMail();
    expect(mail.from).toBe('"PaySplit | Salary Autopilot" <noreply@talentnation.ai>');
    expect(mail.to).toBe('paul@paysplit.com');
    expect(mail.subject).toBe('Verify your PaySplit account');
    expect(mail.html).toContain('184269');
    expect(mail.html).toContain('Paul');
    expect(mail.text).toContain('184269');
    expect(mail.text).not.toContain('<');
  });

  it('renders the KYC approval email', async () => {
    await makeService().sendKycApproved('paul@paysplit.com', 'Paul');
    expect(sentMail().html).toContain('Identity approved');
  });

  it('does not throw when SMTP rejects the send', async () => {
    sendMail.mockRejectedValue(new Error('550 sender not verified'));
    await expect(
      makeService().send({
        to: 'paul@paysplit.com',
        subject: 'x',
        template: 'kyc-approved',
        data: { firstName: 'Paul' },
      }),
    ).resolves.toBe('failed');
  });

  it('throws on SMTP rejection when asked to', async () => {
    sendMail.mockRejectedValue(new Error('550'));
    await expect(
      makeService().send({
        to: 'paul@paysplit.com',
        subject: 'x',
        template: 'kyc-approved',
        data: { firstName: 'Paul' },
        throwOnFailure: true,
      }),
    ).rejects.toThrow('550');
  });

  it('runs in mock mode without credentials', async () => {
    const service = makeService({ 'smtp.host': undefined });
    const result = await service.send({
      to: 'paul@paysplit.com',
      subject: 'x',
      template: 'kyc-approved',
      data: { firstName: 'Paul' },
    });
    expect(result).toBe('mocked');
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('converts HTML to readable text', () => {
    expect(htmlToText('<h2>Hi</h2><p>Your code is <b>1</b>&nbsp;now</p>')).toBe(
      'Hi\nYour code is 1 now',
    );
  });
});

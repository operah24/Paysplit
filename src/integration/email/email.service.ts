import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import * as ejs from 'ejs';
import { join } from 'path';
import { existsSync } from 'fs';

export interface SendEmailOptions {
  to: string;
  subject: string;

  template: string;
  data: Record<string, unknown>;

  throwOnFailure?: boolean;
}

export type SendEmailResult = 'sent' | 'mocked' | 'failed';

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|tr|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&copy;/g, '©')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private readonly from: string;
  private readonly templateDir: string;

  private transporter: Transporter | null = null;

  constructor(private configService: ConfigService) {
    const fromEmail = this.configService.get<string>('smtp.from', 'noreply@paysplit.com');
    const fromName = this.configService.get<string>(
      'email.fromName',
      'PaySplit | Salary Autopilot',
    );
    this.from = `"${fromName}" <${fromEmail}>`;

    const possiblePaths = [
      join(__dirname, 'templates'),
      join(process.cwd(), 'src', 'integration', 'email', 'templates'),
    ];
    let resolvedPath = possiblePaths[0];
    for (const p of possiblePaths) {
      if (existsSync(p)) {
        resolvedPath = p;
        break;
      }
    }
    this.templateDir = resolvedPath;

    const host = this.configService.get<string>('smtp.host');
    const port = this.configService.get<number>('smtp.port', 587);
    const user = this.configService.get<string>('smtp.user');
    const pass = this.configService.get<string>('smtp.pass');

    if (host && user && pass) {
      this.transporter = createTransport({
        host,
        port,

        secure: port === 465,
        requireTLS: port !== 465,
        auth: { user, pass },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
      this.logger.log(`Email service initialized (SMTP ${host}:${port})`);
    } else {
      this.logger.warn(
        'SMTP is not configured. Email service running in MOCK mode (logging to console).',
      );
    }
  }

  onModuleInit(): void {
    this.transporter
      ?.verify()
      .then(() => this.logger.log('SMTP connection verified'))
      .catch((error: Error) => this.logger.error(`SMTP connection check failed: ${error.message}`));
  }

  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    const { to, subject, template, data, throwOnFailure = false } = options;

    const templatePath = join(this.templateDir, `${template}.ejs`);
    let htmlBody: string;
    try {
      htmlBody = await ejs.renderFile(templatePath, data);
    } catch (error) {
      const stack = error instanceof Error ? error.stack : '';
      this.logger.error(`Failed to render email template "${template}" for ${to}`, stack);
      throw error;
    }

    if (!this.transporter) {
      this.logMockEmail(to, subject);
      return 'mocked';
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        html: htmlBody,
        text: htmlToText(htmlBody),
      });
      this.logger.log(`Email "${subject}" sent successfully to ${to}`);
      return 'sent';
    } catch (deliveryError) {
      const message =
        deliveryError instanceof Error ? deliveryError.message : String(deliveryError);
      if (throwOnFailure) {
        this.logger.error(`Email delivery to ${to} failed: ${message}`);
        throw deliveryError;
      }

      this.logger.error(`Email delivery to ${to} failed: ${message}`);
      return 'failed';
    }
  }

  private logMockEmail(to: string, subject: string): void {
    this.logger.log('--- [MOCK EMAIL SENT] ---');
    this.logger.log(`To: ${to}`);
    this.logger.log(`Subject: ${subject}`);
    this.logger.log('--------------------------');
  }

  async sendEmailVerificationCode(
    to: string,
    otp: string,
    firstName: string | null,
    expiresInMinutes: number,
  ): Promise<void> {
    await this.sendOtp(to, otp, 'Verify your PaySplit account', {
      heading: 'Verify your email',
      intro: 'Use the code below to verify your email and finish creating your PaySplit account.',
      firstName,
      expiresInMinutes,
    });
  }

  async sendPasswordResetCode(
    to: string,
    otp: string,
    firstName: string | null,
    expiresInMinutes: number,
  ): Promise<void> {
    await this.sendOtp(to, otp, 'Reset your PaySplit password', {
      heading: 'Reset your password',
      intro: 'Use the code below to reset your PaySplit password.',
      firstName,
      expiresInMinutes,
    });
  }

  async sendKycApproved(to: string, firstName: string | null): Promise<void> {
    await this.send({
      to,
      subject: 'Your PaySplit identity check is complete',
      template: 'kyc-approved',
      data: { firstName },
    });
  }

  private async sendOtp(
    to: string,
    otp: string,
    subject: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const result = await this.send({ to, subject, template: 'otp', data: { ...data, otp } });

    if (result === 'mocked' && this.configService.get<string>('env') !== 'production') {
      this.logger.log(`OTP Code for ${to}: ${otp}`);
    }
  }
}

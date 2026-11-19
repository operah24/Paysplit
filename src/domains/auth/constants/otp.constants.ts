export const OTP_TYPES = {
  REGISTRATION: 'registration',
  PASSWORD_RESET: 'password-reset',
} as const;

export type OtpType = (typeof OTP_TYPES)[keyof typeof OTP_TYPES];

export const OTP_TTL_MINUTES = 10;

export const OTP_MAX_ATTEMPTS = 5;

export const OTP_RESEND_COOLDOWN_SECONDS = 60;

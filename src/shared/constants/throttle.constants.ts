export const THROTTLE_LIMITS = {
  SIGNUP: { ttl: 60000, limit: 5 },

  LOGIN: { ttl: 60000, limit: 10 },

  OTP_SEND: { ttl: 60000, limit: 3 },

  OTP_VERIFY: { ttl: 60000, limit: 5 },

  FORGOT_PASSWORD: { ttl: 60000, limit: 3 },

  RESET_PASSWORD: { ttl: 60000, limit: 5 },

  SET_PASSWORD: { ttl: 60000, limit: 5 },

  KYC_SUBMIT: { ttl: 60000, limit: 10 },

  PROFILE_IMAGE: { ttl: 60000, limit: 10 },

  BANK_RESOLVE: { ttl: 60000, limit: 15 },

  SPLIT_RUN: { ttl: 60000, limit: 5 },

  SIMULATE_CREDIT: { ttl: 60000, limit: 10 },

  EXPORT: { ttl: 60000, limit: 5 },

  LOOKUP: { ttl: 60000, limit: 30 },
} as const;

import * as Joi from 'joi';
import { isDojahSandboxUrl } from '../integration/dojah/dojah.sandbox';

const SANDBOX_IN_PRODUCTION =
  'DOJAH_BASE_URL must not point at the Dojah sandbox when NODE_ENV=production ' +
  '(use https://api.dojah.io, or set ALLOW_DOJAH_SANDBOX=true on non-production deployments)';

const HEPAID_ANY_KEY = /^hp_(test|live)_sk_/;
const HEPAID_KEY_FORMAT = 'HEPAID_SECRET_KEY must be a HePaid secret key (hp_..._sk_...)';
const HEPAID_TEST_KEY_IN_PRODUCTION =
  'HEPAID_SECRET_KEY must be a live secret key (hp_live_sk_...) when NODE_ENV=production ' +
  '(or set ALLOW_HEPAID_TEST_KEY=true on non-production deployments)';

const PAYMENTS_SIMULATION_IN_PRODUCTION =
  'PAYMENTS_SIMULATION must be false when NODE_ENV=production ' +
  '(allowed only on dev/staging deployments with ALLOW_HEPAID_TEST_KEY=true)';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),

  WEB_APP_URL: Joi.string().uri().optional(),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_SSL: Joi.boolean().default(false),
  DB_LOGGING: Joi.boolean().default(false),

  BETTERSTACK_SOURCE_TOKEN: Joi.string().allow('').optional(),

  SMTP_HOST: Joi.string().allow('').optional(),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASS: Joi.string().allow('').optional(),
  SMTP_FROM: Joi.string().email().optional(),
  EMAIL_FROM_NAME: Joi.string().optional(),

  KYC_PROVIDER: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().valid('dojah').default('dojah'),
    otherwise: Joi.string().valid('dojah', 'mock').default('dojah'),
  }),

  DOJAH_BASE_URL: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.when('ALLOW_DOJAH_SANDBOX', {
      is: Joi.boolean().valid(true).required(),
      then: Joi.string().uri().required(),
      otherwise: Joi.string()
        .uri()
        .required()
        .custom((value: string, helpers) =>
          isDojahSandboxUrl(value) ? helpers.message({ custom: SANDBOX_IN_PRODUCTION }) : value,
        ),
    }),
    otherwise: Joi.string().uri().default('https://sandbox.dojah.io'),
  }),

  ALLOW_DOJAH_SANDBOX: Joi.boolean().default(false),
  DOJAH_APP_ID: Joi.string().allow('').optional(),
  DOJAH_SECRET_KEY: Joi.string().allow('').optional(),
  DOJAH_FACE_MATCH_THRESHOLD: Joi.number().min(50).max(100).default(90),
  DOJAH_LIVENESS_THRESHOLD: Joi.number().min(0).max(100).default(80),
  DOJAH_NAME_MATCH_THRESHOLD: Joi.number().min(0).max(100).default(80),

  ALLOW_HEPAID_TEST_KEY: Joi.boolean().default(false),
  HEPAID_BASE_URL: Joi.string().uri().default('https://api.hepaid.com/v1'),
  HEPAID_SECRET_KEY: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.when('ALLOW_HEPAID_TEST_KEY', {
      is: Joi.boolean().valid(true).required(),
      then: Joi.string()
        .pattern(HEPAID_ANY_KEY)
        .allow('')
        .messages({ 'string.pattern.base': HEPAID_KEY_FORMAT }),
      otherwise: Joi.string()
        .pattern(/^hp_live_sk_/)
        .allow('')
        .messages({ 'string.pattern.base': HEPAID_TEST_KEY_IN_PRODUCTION }),
    }),
    otherwise: Joi.string()
      .pattern(HEPAID_ANY_KEY)
      .allow('')
      .messages({ 'string.pattern.base': HEPAID_KEY_FORMAT }),
  }),

  HEPAID_WEBHOOK_SECRET: Joi.string()
    .pattern(/^whsec_/)
    .allow('')
    .optional()
    .messages({
      'string.pattern.base': 'HEPAID_WEBHOOK_SECRET must be the whsec_... signing secret',
    }),

  PAYMENTS_SIMULATION: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.when('ALLOW_HEPAID_TEST_KEY', {
      is: Joi.boolean().valid(true).required(),
      then: Joi.boolean().default(false),
      otherwise: Joi.boolean().valid(false).default(false).messages({
        'any.only': PAYMENTS_SIMULATION_IN_PRODUCTION,
      }),
    }),
    otherwise: Joi.boolean().default(false),
  }),

  HEPAID_TRANSFER_FEE_RESERVE: Joi.number().integer().min(0).max(1_000_000).default(5000),

  JOBS_SCHEDULER_ENABLED: Joi.boolean().default(true),

  JOBS_SECRET: Joi.string().min(32).allow('').optional(),

  CLOUDINARY_CLOUD_NAME: Joi.string().allow('').optional(),
  CLOUDINARY_API_KEY: Joi.string().allow('').optional(),
  CLOUDINARY_API_SECRET: Joi.string().allow('').optional(),
  CLOUDINARY_FOLDER: Joi.string().default('paysplit'),

  KYC_ENCRYPTION_KEY: Joi.string()
    .base64()
    .required()
    .description('base64 of 32 random bytes (AES-256-GCM key)'),
  KYC_MAX_IDENTITY_ATTEMPTS: Joi.number().integer().min(1).default(3),
  KYC_MAX_LIVENESS_ATTEMPTS: Joi.number().integer().min(1).default(5),

  ALLOWED_ORIGINS: Joi.string().default('*'),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('24h'),
  JWT_REMEMBER_ME_EXPIRES_IN: Joi.string().default('30d'),
  JWT_SETUP_TOKEN_EXPIRES_IN: Joi.string().default('15m'),
});

import { isDojahSandboxUrl } from '../integration/dojah/dojah.sandbox';

export default () => ({
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT as string, 10) || 3000,
  app: {
    webUrl: process.env.WEB_APP_URL || 'http://localhost:3000',
  },
  database: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT as string, 10) || 5432,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    name: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true',
  },
  betterstack: {
    sourceToken: process.env.BETTERSTACK_SOURCE_TOKEN,
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT as string, 10) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,

    from: process.env.SMTP_FROM || 'noreply@paysplit.com',
  },
  email: {
    fromName: process.env.EMAIL_FROM_NAME || 'PaySplit | Salary Autopilot',
  },
  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS || '*',
  },
  dojah: {
    baseUrl: process.env.DOJAH_BASE_URL || 'https://sandbox.dojah.io',
    appId: process.env.DOJAH_APP_ID || '',
    secretKey: process.env.DOJAH_SECRET_KEY || '',
    faceMatchThreshold: parseFloat(process.env.DOJAH_FACE_MATCH_THRESHOLD as string) || 90,
    livenessThreshold: parseFloat(process.env.DOJAH_LIVENESS_THRESHOLD as string) || 80,
    nameMatchThreshold: parseFloat(process.env.DOJAH_NAME_MATCH_THRESHOLD as string) || 80,

    sandboxMode: isDojahSandboxUrl(process.env.DOJAH_BASE_URL || 'https://sandbox.dojah.io'),
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    folder: process.env.CLOUDINARY_FOLDER || 'paysplit',
  },
  hepaid: {
    baseUrl: process.env.HEPAID_BASE_URL || 'https://api.hepaid.com/v1',

    secretKey: process.env.HEPAID_SECRET_KEY || '',

    webhookSecret: process.env.HEPAID_WEBHOOK_SECRET || '',
  },
  payments: {
    simulation: process.env.PAYMENTS_SIMULATION === 'true',

    transferFeeReserve: parseInt(process.env.HEPAID_TRANSFER_FEE_RESERVE as string, 10) || 5000,
  },
  jobs: {
    schedulerEnabled: process.env.JOBS_SCHEDULER_ENABLED !== 'false',

    secret: process.env.JOBS_SECRET || '',
  },
  kyc: {
    provider: process.env.KYC_PROVIDER || 'dojah',
    encryptionKey: process.env.KYC_ENCRYPTION_KEY,
    maxIdentityAttemptsPerDay: parseInt(process.env.KYC_MAX_IDENTITY_ATTEMPTS as string, 10) || 3,
    maxLivenessAttemptsPerDay: parseInt(process.env.KYC_MAX_LIVENESS_ATTEMPTS as string, 10) || 5,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',

    rememberMeExpiresIn: process.env.JWT_REMEMBER_ME_EXPIRES_IN || '30d',

    setupTokenExpiresIn: process.env.JWT_SETUP_TOKEN_EXPIRES_IN || '15m',
  },
});

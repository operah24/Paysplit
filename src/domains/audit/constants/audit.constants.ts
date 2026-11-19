export const ADMIN_AUDIT_ACTIONS = {
  LOGIN: 'admin.login',
  LOGIN_FAILED: 'admin.login_failed',
  LOGOUT: 'admin.logout',
  PASSWORD_CHANGED: 'admin.password_changed',
  PASSWORD_RESET: 'admin.password_reset',
  PROFILE_UPDATED: 'admin.profile_updated',

  USER_VIEWED: 'admin.user_viewed',

  USER_VERIFICATION_VIEWED: 'admin.user_verification_viewed',
} as const;

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[keyof typeof ADMIN_AUDIT_ACTIONS];

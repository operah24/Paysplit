export const NOTIFICATION_CHANNELS = ['push', 'sms', 'email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_TOPICS = {
  salaryReceived: 'Salary received in your PaySplit account',
  splitCompleted: 'Split rules ran and money was distributed',
  transferUpdates: 'Beneficiary transfer succeeded, failed or was reversed',
  accountUpdates: 'Security and account updates (KYC, password, setup)',
} as const;
export type NotificationTopic = keyof typeof NOTIFICATION_TOPICS;
export const NOTIFICATION_TOPIC_KEYS = Object.keys(NOTIFICATION_TOPICS) as NotificationTopic[];

export type ChannelPreferences = Record<NotificationTopic, boolean>;
export type NotificationPreferences = Record<NotificationChannel, ChannelPreferences>;

const allOn = (): ChannelPreferences => ({
  salaryReceived: true,
  splitCompleted: true,
  transferUpdates: true,
  accountUpdates: true,
});

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  push: allOn(),
  sms: { salaryReceived: true, splitCompleted: false, transferUpdates: true, accountUpdates: true },
  email: allOn(),
};

export function resolveNotificationPreferences(
  stored: Partial<Record<NotificationChannel, Partial<ChannelPreferences>>> | null | undefined,
): NotificationPreferences {
  const result = {} as NotificationPreferences;
  for (const channel of NOTIFICATION_CHANNELS) {
    result[channel] = {
      ...DEFAULT_NOTIFICATION_PREFERENCES[channel],
      ...(stored?.[channel] ?? {}),
    };
  }
  return result;
}

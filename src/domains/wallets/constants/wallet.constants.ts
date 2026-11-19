export const WALLET_ACCENT_COLORS = {
  green: '#22A447',
  orange: '#F5582A',
  purple: '#8B3DF5',
  blue: '#4BA3F2',
  red: '#E5484D',
  yellow: '#F5B82A',
  teal: '#14B8A6',
  pink: '#EC4899',
} as const;

export type WalletAccentColor = keyof typeof WALLET_ACCENT_COLORS;

export const WALLET_ACCENT_COLOR_KEYS = Object.keys(WALLET_ACCENT_COLORS) as WalletAccentColor[];

export const WALLET_ERROR_CODES = {
  WALLET_NOT_FOUND: 'WALLET_NOT_FOUND',
  WALLET_NAME_TAKEN: 'WALLET_NAME_TAKEN',
  WALLET_NOT_EMPTY: 'WALLET_NOT_EMPTY',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
} as const;

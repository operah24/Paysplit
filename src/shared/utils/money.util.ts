export const MIN_AMOUNT_MINOR = 100;

export const MAX_AMOUNT_MINOR = 10_000_000_000;

export const FULL_BPS = 10_000;

export function applyBps(amountMinor: number, bps: number): number {
  return Number((BigInt(Math.trunc(amountMinor)) * BigInt(Math.trunc(bps))) / BigInt(FULL_BPS));
}

export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

export function bpsToPercent(bps: number): number {
  return bps / 100;
}

export function percentOf(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

export function toMinor(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

const NAIRA = new Intl.NumberFormat('en-NG', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMajor(amountMinor: number): string {
  return NAIRA.format(amountMinor / 100);
}

export function formatNaira(amountMinor: number): string {
  return `₦${formatMajor(amountMinor)}`;
}

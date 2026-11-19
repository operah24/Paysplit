import { createHmac, timingSafeEqual } from 'crypto';

export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function verifyHepaidSignature(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = SIGNATURE_TOLERANCE_SECONDS,
): boolean {
  if (!header || !secret) return false;

  const parts = new Map<string, string>();
  for (const part of header.split(',')) {
    const index = part.indexOf('=');
    if (index > 0) parts.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  const t = parts.get('t') ?? '';
  const v1 = parts.get('v1') ?? '';
  if (!/^\d+$/.test(t) || !/^[0-9a-f]+$/.test(v1)) return false;
  if (Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return false;

  const expected = createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex');
  return v1.length === expected.length && timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}

export function signHepaidPayload(rawBody: string, secret: string, t: number): string {
  const v1 = createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex');
  return `t=${t},v1=${v1}`;
}

import { createHmac } from 'crypto';
import { signHepaidPayload, verifyHepaidSignature } from './hepaid-signature';

const SECRET = 'whsec_test_secret_value';
const BODY =
  '{"id":"evt_1","type":"ping","createdAt":"2026-11-01T15:31:36+00:00","mode":"Test","data":{}}';
const NOW = 1_762_011_096;

describe('verifyHepaidSignature', () => {
  it('accepts a signature computed as HePaid documents it (HMAC of "{t}.{raw body}")', () => {
    const v1 = createHmac('sha256', SECRET).update(`${NOW}.${BODY}`).digest('hex');
    expect(verifyHepaidSignature(Buffer.from(BODY), `t=${NOW},v1=${v1}`, SECRET, NOW)).toBe(true);
  });

  it('rejects a modified body', () => {
    const header = signHepaidPayload(BODY, SECRET, NOW);
    const tampered = Buffer.from(BODY.replace('ping', 'wallet.credited'));
    expect(verifyHepaidSignature(tampered, header, SECRET, NOW)).toBe(false);
  });

  it('rejects the wrong secret, including the secret without its whsec_ prefix', () => {
    const header = signHepaidPayload(BODY, SECRET, NOW);
    expect(verifyHepaidSignature(Buffer.from(BODY), header, 'whsec_other', NOW)).toBe(false);
    const unprefixed = signHepaidPayload(BODY, 'test_secret_value', NOW);
    expect(verifyHepaidSignature(Buffer.from(BODY), unprefixed, SECRET, NOW)).toBe(false);
  });

  it('rejects a signature older than 5 minutes (replay)', () => {
    const header = signHepaidPayload(BODY, SECRET, NOW - 301);
    expect(verifyHepaidSignature(Buffer.from(BODY), header, SECRET, NOW)).toBe(false);
    const recent = signHepaidPayload(BODY, SECRET, NOW - 299);
    expect(verifyHepaidSignature(Buffer.from(BODY), recent, SECRET, NOW)).toBe(true);
  });

  it('rejects missing or malformed headers and a missing secret', () => {
    const body = Buffer.from(BODY);
    expect(verifyHepaidSignature(body, undefined, SECRET, NOW)).toBe(false);
    expect(verifyHepaidSignature(body, 'garbage', SECRET, NOW)).toBe(false);
    expect(verifyHepaidSignature(body, `t=abc,v1=00`, SECRET, NOW)).toBe(false);
    expect(verifyHepaidSignature(body, `t=${NOW}`, SECRET, NOW)).toBe(false);
    expect(verifyHepaidSignature(body, signHepaidPayload(BODY, SECRET, NOW), '', NOW)).toBe(false);
  });
});

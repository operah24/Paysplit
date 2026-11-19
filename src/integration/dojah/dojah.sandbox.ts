export function isDojahSandboxUrl(baseUrl: string | undefined | null): boolean {
  if (!baseUrl) return false;
  try {
    return new URL(baseUrl).hostname.toLowerCase() === 'sandbox.dojah.io';
  } catch {
    return false;
  }
}

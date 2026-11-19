export class HepaidError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = 'HepaidError';
  }

  get isOutcomeUnknown(): boolean {
    return (
      this.isProviderFailure ||
      this.code === 'idempotency_in_progress' ||
      this.code === 'duplicate_reference'
    );
  }

  get isProviderFailure(): boolean {
    return (
      this.status === 0 ||
      this.status >= 500 ||
      this.status === 429 ||
      this.status === 401 ||
      this.status === 403 ||
      this.code === 'no_gateway_available' ||
      this.code === 'gateway_unavailable' ||
      this.code === 'product_disabled'
    );
  }
}

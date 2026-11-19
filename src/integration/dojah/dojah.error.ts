export class DojahError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'DojahError';
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isBadRequest(): boolean {
    return this.status === 400;
  }

  get isProviderFailure(): boolean {
    return !this.isNotFound && !this.isBadRequest;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { HepaidError } from './hepaid.error';
import {
  CreateHepaidTransferInput,
  CreateHepaidWalletInput,
  HepaidBalance,
  HepaidBank,
  HepaidEnvelope,
  HepaidPage,
  HepaidResolvedAccount,
  HepaidTransfer,
  HepaidWallet,
  HepaidWalletEntry,
} from './hepaid.types';

type Method = 'GET' | 'POST' | 'PUT';
type Query = Record<string, string | number | undefined>;

interface RequestOptions {
  query?: Query;
  body?: unknown;

  idempotencyKey?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

const BANK_LIST_TIMEOUT_MS = 90_000;
const BANK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RETRY_DELAY_MS = 1_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class HepaidService {
  private readonly logger = new Logger(HepaidService.name);
  private readonly baseUrl: string;
  private readonly secretKey: string;

  private bankCache = new Map<string, { banks: HepaidBank[]; fetchedAt: number }>();
  private bankRequests = new Map<string, Promise<HepaidBank[]>>();

  constructor(configService: ConfigService) {
    this.baseUrl = configService
      .get<string>('hepaid.baseUrl', 'https://api.hepaid.com/v1')
      .replace(/\/+$/, '');
    this.secretKey = configService.get<string>('hepaid.secretKey', '');

    if (!this.secretKey) {
      this.logger.warn('HEPAID_SECRET_KEY not set — bank lookups and payments will fail.');
    }
  }

  get isConfigured(): boolean {
    return Boolean(this.secretKey);
  }

  async listBanks(currency = 'NGN'): Promise<HepaidBank[]> {
    const cached = this.bankCache.get(currency);
    if (cached && Date.now() - cached.fetchedAt < BANK_CACHE_TTL_MS) return cached.banks;

    const inFlight = this.bankRequests.get(currency);
    if (inFlight) return inFlight;

    const request = this.request<HepaidBank[]>('GET', '/banks', {
      query: { currency },
      timeoutMs: BANK_LIST_TIMEOUT_MS,
    })
      .then((banks) => {
        const cleaned = banks
          .map((bank) => ({ code: bank.code.trim(), name: bank.name.trim() }))
          .sort((a, b) => a.name.localeCompare(b.name));
        this.bankCache.set(currency, { banks: cleaned, fetchedAt: Date.now() });
        return cleaned;
      })
      .finally(() => this.bankRequests.delete(currency));

    this.bankRequests.set(currency, request);
    return request;
  }

  resolveAccount(
    bankCode: string,
    accountNumber: string,
    currency = 'NGN',
  ): Promise<HepaidResolvedAccount> {
    return this.request<HepaidResolvedAccount>('GET', '/banks/resolve', {
      query: { currency, bankCode, accountNumber },
    });
  }

  createWallet(input: CreateHepaidWalletInput): Promise<HepaidWallet> {
    return this.request<HepaidWallet>('POST', '/wallets', {
      body: { currency: 'NGN', ...input },
      idempotencyKey: `wallet:${input.reference}`,
    });
  }

  getWallet(reference: string): Promise<HepaidWallet> {
    return this.request<HepaidWallet>('GET', `/wallets/${encodeURIComponent(reference)}`);
  }

  listWalletTransactions(
    reference: string,
    page = 1,
    pageSize = 100,
  ): Promise<HepaidPage<HepaidWalletEntry>> {
    return this.request<HepaidPage<HepaidWalletEntry>>(
      'GET',
      `/wallets/${encodeURIComponent(reference)}/transactions`,
      { query: { page, pageSize } },
    );
  }

  createTransfer(input: CreateHepaidTransferInput): Promise<HepaidTransfer> {
    return this.request<HepaidTransfer>('POST', '/transfers', {
      body: { currency: 'NGN', ...input },
      idempotencyKey: `transfer:${input.reference}`,
    });
  }

  getTransfer(reference: string): Promise<HepaidTransfer> {
    return this.request<HepaidTransfer>('GET', `/transfers/${encodeURIComponent(reference)}`);
  }

  getBalances(): Promise<HepaidBalance[]> {
    return this.request<HepaidBalance[]>('GET', '/balances');
  }

  private async request<T>(method: Method, path: string, options: RequestOptions = {}): Promise<T> {
    if (!this.secretKey) {
      throw new HepaidError(0, 'not_configured', 'HePaid is not configured (HEPAID_SECRET_KEY).');
    }

    const idempotencyKey =
      method === 'GET' ? undefined : (options.idempotencyKey ?? `ps:${randomUUID()}`);

    try {
      return await this.send<T>(method, path, options, idempotencyKey);
    } catch (error) {
      if (!(error instanceof HepaidError) || !HepaidService.isRetryable(error)) throw error;
      this.logger.warn(`HePaid ${method} ${path} failed (${error.status}); retrying once`);
      await sleep(RETRY_DELAY_MS);
      return this.send<T>(method, path, options, idempotencyKey);
    }
  }

  private async send<T>(
    method: Method,
    path: string,
    options: RequestOptions,
    idempotencyKey: string | undefined,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
      Accept: 'application/json',
    };
    let body: string | undefined;
    if (method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      headers['Idempotency-Key'] = idempotencyKey!;
      body = JSON.stringify(options.body ?? {});
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, { method, headers, body, signal: controller.signal });
    } catch (error) {
      const reason = (error as Error).name === 'AbortError' ? 'timed out' : 'network error';
      throw new HepaidError(0, 'network_error', `HePaid request ${reason}`);
    } finally {
      clearTimeout(timer);
    }

    let envelope: HepaidEnvelope<T> | null = null;
    try {
      envelope = (await response.json()) as HepaidEnvelope<T>;
    } catch {
      envelope = null;
    }

    if (!response.ok || !envelope?.success || envelope.data === null) {
      const err = envelope?.error;
      throw new HepaidError(
        response.status,
        err?.code ?? `http_${response.status}`,
        err?.message ?? `HePaid returned HTTP ${response.status}`,
        err?.details ?? null,
      );
    }
    return envelope.data;
  }

  private static isRetryable(error: HepaidError): boolean {
    return (
      error.status === 0 ||
      error.status === 429 ||
      error.status >= 500 ||
      error.code === 'idempotency_in_progress'
    );
  }
}

import { ConfigService } from '@nestjs/config';
import { DojahService } from './dojah.service';
import { DojahError } from './dojah.error';

const config: Record<string, string> = {
  'dojah.baseUrl': 'https://sandbox.dojah.io',
  'dojah.appId': 'app-123',
  'dojah.secretKey': 'secret-xyz',
};

const respond = (status: number, body: unknown) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'status',
    json: () => Promise.resolve(body),
  } as Response);

describe('DojahService', () => {
  let service: DojahService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    service = new DojahService({
      get: (key: string, fallback?: string) => config[key] ?? fallback,
    } as unknown as ConfigService);
  });

  afterEach(() => jest.useRealTimers());

  it('uses deterministic Nigerian test identities in mock mode', async () => {
    const mockService = new DojahService({
      get: (key: string, fallback?: string) =>
        ({ ...config, 'kyc.provider': 'mock', env: 'development' })[key] ?? fallback,
    } as unknown as ConfigService);

    await expect(mockService.validateBvn('22222222222', 'Paul', 'Obi')).resolves.toEqual({
      valid: true,
      firstNameScore: 100,
      lastNameScore: 100,
    });
    await expect(mockService.lookupNin('70123456789')).resolves.toMatchObject({
      firstName: 'PAUL',
      lastName: 'OBI',
    });
    await expect(mockService.checkLiveness('test-image')).resolves.toEqual({
      isLive: true,
      probability: 99,
      faceDetected: true,
      multipleFaces: false,
    });
  });

  it('refuses mock mode in production', () => {
    expect(
      () =>
        new DojahService({
          get: (key: string, fallback?: string) =>
            ({ ...config, 'kyc.provider': 'mock', env: 'production' })[key] ?? fallback,
        } as unknown as ConfigService),
    ).toThrow('KYC_PROVIDER=mock cannot be used in production.');
  });

  const lastCall = () => {
    const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [URL, RequestInit];
    return {
      url: url.toString(),
      init,
      body: init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined,
    };
  };

  it('sends the raw secret key and AppId (no Bearer prefix)', async () => {
    fetchMock.mockReturnValue(respond(200, { entity: { bvn: { status: true } } }));
    await service.validateBvn('22222222222', 'Paul', 'Obi');

    const { url, init } = lastCall();
    expect(url).toBe(
      'https://sandbox.dojah.io/api/v1/kyc/bvn?bvn=22222222222&first_name=Paul&last_name=Obi',
    );
    expect(init.headers).toMatchObject({ Authorization: 'secret-xyz', AppId: 'app-123' });
  });

  it('maps Validate BVN name scores', async () => {
    fetchMock.mockReturnValue(
      respond(200, {
        entity: {
          bvn: { value: '2*****22222', status: true },
          first_name: { confidence_value: 100, status: true },
          last_name: { confidence_value: 72, status: false },
        },
      }),
    );
    await expect(service.validateBvn('22222222222', 'Paul', 'Obi')).resolves.toEqual({
      valid: true,
      firstNameScore: 100,
      lastNameScore: 72,
    });
  });

  it('treats a string `bvn` (sandbox shape) as a found record', async () => {
    fetchMock.mockReturnValue(
      respond(200, {
        entity: {
          bvn: '22468537919',
          first_name: { confidence_value: 100, status: true },
          last_name: { confidence_value: 100, status: true },
        },
      }),
    );
    await expect(service.validateBvn('22222222222', 'Paul', 'Obi')).resolves.toEqual({
      valid: true,
      firstNameScore: 100,
      lastNameScore: 100,
    });
  });

  it('reports invalid when `bvn.status` is false', async () => {
    fetchMock.mockReturnValue(respond(200, { entity: { bvn: { value: '', status: false } } }));
    await expect(service.validateBvn('22222222222', 'Paul', 'Obi')).resolves.toMatchObject({
      valid: false,
    });
  });

  it('normalises NIN-style field names on selfie verification', async () => {
    fetchMock.mockReturnValue(
      respond(200, {
        entity: {
          firstname: 'PAUL',
          surname: 'OBI',
          birthdate: '10-06-1983',
          selfie_verification: { confidence_value: 99.81, match: true },
        },
      }),
    );
    const result = await service.verifySelfieWithNin('70123456789', 'base64img', 90);

    expect(lastCall().body).toEqual({
      nin: '70123456789',
      selfie_image: 'base64img',
      threshold: 90,
    });
    expect(result).toEqual({
      match: true,
      confidence: 99.81,
      record: { firstName: 'PAUL', middleName: null, lastName: 'OBI', dateOfBirth: '10-06-1983' },
    });
  });

  it('maps liveness results', async () => {
    fetchMock.mockReturnValue(
      respond(200, {
        entity: {
          liveness: { liveness_check: true, liveness_probability: 98 },
          face: { face_detected: true, multiface_detected: false },
        },
      }),
    );
    await expect(service.checkLiveness('img')).resolves.toEqual({
      isLive: true,
      probability: 98,
      faceDetected: true,
      multipleFaces: false,
    });
  });

  it('maps the current spoof/confidence liveness shape (live face)', async () => {
    fetchMock.mockReturnValue(
      respond(200, {
        entity: {
          liveness: { spoof: false, confidence: 97.5 },
          face: { detected: true, message: 'Face detected' },
        },
      }),
    );
    await expect(service.checkLiveness('img')).resolves.toEqual({
      isLive: true,
      probability: 97.5,
      faceDetected: true,
      multipleFaces: false,
    });
  });

  it('maps the current shape when Dojah flags a spoof', async () => {
    fetchMock.mockReturnValue(
      respond(200, {
        entity: {
          liveness: { spoof: true, confidence: 99.99720001220703 },
          face: { detected: true, message: 'Face detected' },
        },
      }),
    );
    const result = await service.checkLiveness('img');
    expect(result.isLive).toBe(false);
    expect(result.probability).toBeCloseTo(0.0028, 3);
    expect(result.faceDetected).toBe(true);
  });

  it('reports no face in the current shape', async () => {
    fetchMock.mockReturnValue(
      respond(200, {
        entity: { liveness: { spoof: true, confidence: 50 }, face: { detected: false } },
      }),
    );
    await expect(service.checkLiveness('img')).resolves.toMatchObject({ faceDetected: false });
  });

  it('throws a not-found DojahError on 404 without retrying', async () => {
    fetchMock.mockReturnValue(respond(404, { error: 'No record found' }));
    const error = (await service.lookupNin('70123456789').catch((e: unknown) => e)) as DojahError;
    expect(error).toBeInstanceOf(DojahError);
    expect(error.isNotFound).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries once on a retryable status', async () => {
    fetchMock
      .mockReturnValueOnce(respond(503, {}))
      .mockReturnValueOnce(respond(200, { entity: { firstname: 'PAUL' } }));
    const promise = service.lookupNin('70123456789');
    await jest.advanceTimersByTimeAsync(1_000);
    await expect(promise).resolves.toMatchObject({ firstName: 'PAUL' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports a provider failure when credentials are missing', async () => {
    const unconfigured = new DojahService({
      get: (_key: string, fallback?: string) => fallback ?? '',
    } as unknown as ConfigService);
    const error = (await unconfigured.lookupNin('1').catch((e: unknown) => e)) as DojahError;
    expect(error.isProviderFailure).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

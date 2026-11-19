import { ServiceUnavailableException } from '@nestjs/common';

const configMock = jest.fn();
const uploadStream = jest.fn();
const destroy = jest.fn();
const cloudinaryConfig = jest.fn();

jest.mock('cloudinary', () => ({
  v2: {
    config: cloudinaryConfig,
    uploader: { upload_stream: uploadStream, destroy },
  },
}));

import { StorageService } from './storage.service';

type UploadCallback = (error: Error | undefined, result?: { secure_url?: string }) => void;

const config = (values: Record<string, string>) =>
  ({
    get: configMock.mockImplementation((key: string, fallback?: string) => values[key] ?? fallback),
  }) as never;

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StorageService(
      config({
        'cloudinary.cloudName': 'demo',
        'cloudinary.apiKey': 'key',
        'cloudinary.apiSecret': 'secret',
        'cloudinary.folder': 'paysplit',
      }),
    );
  });

  it('configures Cloudinary with the server credentials', () => {
    expect(cloudinaryConfig).toHaveBeenCalledWith({
      cloud_name: 'demo',
      api_key: 'key',
      api_secret: 'secret',
      secure: true,
    });
  });

  it('uploads and returns the secure URL', async () => {
    const end = jest.fn();
    uploadStream.mockImplementation((_options: unknown, callback: UploadCallback) => {
      callback(null, {
        secure_url:
          'https://res.cloudinary.com/demo/image/upload/v1/paysplit/profile-images/u1/x.png',
      });
      return { end };
    });

    const url = await service.upload('profile-images/u1/x.png', Buffer.from('x'), 'image/png');

    expect(uploadStream).toHaveBeenCalledWith(
      expect.objectContaining({
        public_id: 'paysplit/profile-images/u1/x',
        resource_type: 'image',
        format: 'png',
      }),
      expect.any(Function),
    );
    expect(end).toHaveBeenCalledWith(Buffer.from('x'));
    expect(url).toContain('res.cloudinary.com/demo');
  });

  it('maps upload failures to 503', async () => {
    uploadStream.mockImplementation((_options: unknown, callback: UploadCallback) => {
      callback(new Error('Cloudinary unavailable'));
      return { end: jest.fn() };
    });

    await expect(
      service.upload('profile-images/u1/x.png', Buffer.from('x'), 'image/png'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('deletes Cloudinary assets from its own URLs', async () => {
    destroy.mockResolvedValue({ result: 'ok' });

    await service.deleteByUrl(
      'https://res.cloudinary.com/demo/image/upload/v1/paysplit/profile-images/u1/x.png',
    );

    expect(destroy).toHaveBeenCalledWith('paysplit/profile-images/u1/x', {
      resource_type: 'image',
      invalidate: true,
    });
  });

  it('ignores URLs from other hosts', async () => {
    await service.deleteByUrl('https://example.com/paysplit/profile-images/u1/x.png');
    expect(destroy).not.toHaveBeenCalled();
  });

  it('fails with 503 when Cloudinary is not configured', async () => {
    const unconfigured = new StorageService(config({}));
    await expect(
      unconfigured.upload('profile-images/u1/x.png', Buffer.from('x'), 'image/png'),
    ).rejects.toThrow('File storage is not configured.');
  });
});

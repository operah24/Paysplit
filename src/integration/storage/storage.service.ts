import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly cloudName: string;
  private readonly folder: string;
  private readonly configured: boolean;

  constructor(configService: ConfigService) {
    this.cloudName = configService.get<string>('cloudinary.cloudName', '');
    this.folder = configService.get<string>('cloudinary.folder', 'paysplit');
    const apiKey = configService.get<string>('cloudinary.apiKey', '');
    const apiSecret = configService.get<string>('cloudinary.apiSecret', '');
    this.configured = Boolean(this.cloudName && apiKey && apiSecret);

    if (!this.configured) {
      this.logger.warn('Cloudinary credentials are not configured — file uploads will fail.');
      return;
    }

    cloudinary.config({
      cloud_name: this.cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
  }

  async upload(path: string, data: Buffer, contentType: string): Promise<string> {
    if (!this.configured) throw new ServiceUnavailableException('File storage is not configured.');

    const publicId = this.publicIdFor(path);
    try {
      return await new Promise<string>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            public_id: publicId,
            resource_type: 'image',
            overwrite: false,
            invalidate: true,
            format: this.extensionFrom(path),
            context: { content_type: contentType },
          },
          (error, result) => {
            if (error) {
              reject(
                new Error(error instanceof Error ? error.message : 'Cloudinary upload failed'),
              );
              return;
            }
            if (!result?.secure_url) {
              reject(new Error('Cloudinary returned no secure URL'));
              return;
            }
            resolve(result.secure_url);
          },
        );
        stream.end(data);
      });
    } catch (error) {
      this.logger.error(`Upload to ${path} failed: ${(error as Error).message}`);
      throw new ServiceUnavailableException('File storage is unavailable. Please try again.');
    }
  }

  async deleteByUrl(url: string): Promise<void> {
    const publicId = this.publicIdFromUrl(url);
    if (!publicId || !this.configured) return;

    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
    } catch (error) {
      this.logger.warn(
        `Could not delete Cloudinary asset ${publicId}: ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException('File storage is unavailable. Please try again.');
    }
  }

  private publicIdFor(path: string): string {
    const withoutExtension = path.replace(/\.[^/.]+$/, '');
    return `${this.folder}/${withoutExtension}`.replace(/^\/+/, '');
  }

  private publicIdFromUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      const prefix = `/${this.cloudName}/image/upload/`;
      if (parsed.hostname !== 'res.cloudinary.com' || !parsed.pathname.startsWith(prefix)) {
        return null;
      }

      const path = parsed.pathname.slice(prefix.length).replace(/^v\d+\//, '');
      return decodeURIComponent(path).replace(/\.[^/.]+$/, '') || null;
    } catch {
      return null;
    }
  }

  private extensionFrom(path: string): string | undefined {
    return path.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  }
}

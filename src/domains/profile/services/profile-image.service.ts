import { randomUUID } from 'crypto';
import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { StorageService } from '../../../integration/storage/storage.service';
import { detectImageType } from '../../../shared/utils/image-type.util';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/services/users.service';

export const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export interface ProfileImageResponse {
  message: string;
  profileImageUrl: string | null;
}

@Injectable()
export class ProfileImageService {
  private readonly logger = new Logger(ProfileImageService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly storageService: StorageService,
  ) {}

  async upload(user: User, file: Express.Multer.File | undefined): Promise<ProfileImageResponse> {
    if (!file?.buffer?.length) throw ProfileImageService.invalid('An image file is required');
    if (file.size > PROFILE_IMAGE_MAX_BYTES) {
      throw ProfileImageService.invalid('Image must be 5MB or smaller');
    }
    const type = detectImageType(file.buffer);
    if (!type) throw ProfileImageService.invalid('Image must be a PNG, JPG or WebP');

    const path = `profile-images/${user.id}/${randomUUID()}.${type.extension}`;
    const url = await this.storageService.upload(path, file.buffer, type.contentType);
    await this.usersService.update(user.id, { profileImageUrl: url });
    await this.deleteQuietly(user.profileImageUrl);

    return { message: 'Profile picture updated', profileImageUrl: url };
  }

  async remove(user: User): Promise<ProfileImageResponse> {
    if (user.profileImageUrl) {
      await this.usersService.update(user.id, { profileImageUrl: null });
      await this.deleteQuietly(user.profileImageUrl);
    }
    return { message: 'Profile picture removed', profileImageUrl: null };
  }

  private async deleteQuietly(url: string | null | undefined): Promise<void> {
    if (!url) return;
    try {
      await this.storageService.deleteByUrl(url);
    } catch (error) {
      this.logger.warn(`Could not delete old profile image: ${(error as Error).message}`);
    }
  }

  private static invalid(message: string) {
    return new UnprocessableEntityException({
      statusCode: 422,
      error: 'Unprocessable Entity',
      code: 'INVALID_IMAGE',
      message,
    });
  }
}

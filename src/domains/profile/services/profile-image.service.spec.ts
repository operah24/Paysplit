import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { ProfileImageService, PROFILE_IMAGE_MAX_BYTES } from './profile-image.service';
import { User } from '../../users/entities/user.entity';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'binary');

const file = (buffer: Buffer, size = buffer.length) =>
  ({ buffer, size }) as unknown as Express.Multer.File;

const OLD_URL = 'https://storage.googleapis.com/bucket/profile-images/u1/old.png';

describe('ProfileImageService', () => {
  let usersService: { update: jest.Mock };
  let storageService: { upload: jest.Mock; deleteByUrl: jest.Mock };
  let service: ProfileImageService;

  const user = (profileImageUrl: string | null = null) => ({ id: 'u1', profileImageUrl }) as User;

  beforeEach(() => {
    usersService = { update: jest.fn().mockResolvedValue(undefined) };
    storageService = {
      upload: jest.fn((path: string) =>
        Promise.resolve(`https://storage.googleapis.com/bucket/${path}`),
      ),
      deleteByUrl: jest.fn().mockResolvedValue(undefined),
    };
    service = new ProfileImageService(usersService as never, storageService as never);
  });

  it.each([
    [PNG, 'png', 'image/png'],
    [JPG, 'jpg', 'image/jpeg'],
    [WEBP, 'webp', 'image/webp'],
  ])('uploads a valid image under the user folder (%#)', async (buffer, ext, contentType) => {
    const result = await service.upload(user(), file(buffer));

    const [path, data, type] = storageService.upload.mock.calls[0] as [string, Buffer, string];
    expect(path).toMatch(new RegExp(`^profile-images/u1/[0-9a-f-]{36}\\.${ext}$`));
    expect(data).toBe(buffer);
    expect(type).toBe(contentType);
    expect(usersService.update).toHaveBeenCalledWith('u1', {
      profileImageUrl: result.profileImageUrl,
    });
    expect(storageService.deleteByUrl).not.toHaveBeenCalled();
  });

  it('deletes the previous image after saving the new one', async () => {
    await service.upload(user(OLD_URL), file(PNG));
    expect(storageService.deleteByUrl).toHaveBeenCalledWith(OLD_URL);
  });

  it('still succeeds if deleting the previous image fails', async () => {
    storageService.deleteByUrl.mockRejectedValue(new Error('boom'));
    await expect(service.upload(user(OLD_URL), file(PNG))).resolves.toMatchObject({
      message: 'Profile picture updated',
    });
  });

  it.each([
    ['missing file', undefined],
    ['empty file', file(Buffer.alloc(0))],
    ['non-image bytes', file(Buffer.from('GIF89a-not-allowed'))],
    ['oversized file', file(PNG, PROFILE_IMAGE_MAX_BYTES + 1)],
  ])('rejects %s with 422 and touches nothing', async (_label, input) => {
    await expect(service.upload(user(), input)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(storageService.upload).not.toHaveBeenCalled();
    expect(usersService.update).not.toHaveBeenCalled();
  });

  it('does not change the user if the upload fails', async () => {
    storageService.upload.mockRejectedValue(new ServiceUnavailableException());
    await expect(service.upload(user(OLD_URL), file(PNG))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(usersService.update).not.toHaveBeenCalled();
    expect(storageService.deleteByUrl).not.toHaveBeenCalled();
  });

  it('removes an existing image', async () => {
    await expect(service.remove(user(OLD_URL))).resolves.toEqual({
      message: 'Profile picture removed',
      profileImageUrl: null,
    });
    expect(usersService.update).toHaveBeenCalledWith('u1', { profileImageUrl: null });
    expect(storageService.deleteByUrl).toHaveBeenCalledWith(OLD_URL);
  });

  it('remove is a no-op when there is no image', async () => {
    await service.remove(user());
    expect(usersService.update).not.toHaveBeenCalled();
    expect(storageService.deleteByUrl).not.toHaveBeenCalled();
  });
});

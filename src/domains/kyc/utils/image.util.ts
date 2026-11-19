import { UnprocessableEntityException } from '@nestjs/common';
import { KYC_ERROR_CODES, KYC_MAX_IMAGE_BYTES } from '../constants/kyc.constants';
import { detectImageType } from '../../../shared/utils/image-type.util';

export function toValidatedImageBase64(
  file: Express.Multer.File | undefined,
  label: string,
): string {
  const reject = (message: string) =>
    new UnprocessableEntityException({
      statusCode: 422,
      error: 'Unprocessable Entity',
      code: KYC_ERROR_CODES.INVALID_IMAGE,
      message,
    });

  if (!file?.buffer?.length) throw reject(`${label} image is required`);
  if (file.size > KYC_MAX_IMAGE_BYTES) throw reject(`${label} image must be 2MB or smaller`);

  const type = detectImageType(file.buffer);
  if (type?.extension !== 'png' && type?.extension !== 'jpg') {
    throw reject(`${label} image must be a PNG or JPG`);
  }
  return file.buffer.toString('base64');
}

export type ImageType = { extension: 'png' | 'jpg' | 'webp'; contentType: string };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

const matchesAt = (buffer: Buffer, signature: number[], offset = 0) =>
  buffer.length >= offset + signature.length &&
  signature.every((byte, i) => buffer[offset + i] === byte);

export function detectImageType(buffer: Buffer): ImageType | null {
  if (matchesAt(buffer, PNG_SIGNATURE)) return { extension: 'png', contentType: 'image/png' };
  if (matchesAt(buffer, JPEG_SIGNATURE)) return { extension: 'jpg', contentType: 'image/jpeg' };
  if (matchesAt(buffer, RIFF) && matchesAt(buffer, WEBP, 8)) {
    return { extension: 'webp', contentType: 'image/webp' };
  }
  return null;
}

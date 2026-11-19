import { ApiProperty } from '@nestjs/swagger';

export class SelfieUploadDto {
  @ApiProperty({ type: 'string', format: 'binary', description: 'Selfie (PNG/JPG, max 2MB)' })
  selfie: unknown;
}

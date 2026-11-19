import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { SUPPORTED_COUNTRIES } from '../constants/countries.constants';

export class UpdateProfileDto {
  @ApiProperty({
    description: 'ISO 3166-1 alpha-2 code from GET /kyc/countries',
    example: 'NG',
    enum: SUPPORTED_COUNTRIES.map((c) => c.code),
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(SUPPORTED_COUNTRIES.map((c) => c.code), { message: 'countryCode is not supported' })
  countryCode: string;

  @ApiProperty({
    description: 'Mobile number, local or international format. Validated for the country.',
    example: '803 456 7890',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phoneNumber: string;
}

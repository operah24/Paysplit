import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Paul', description: 'Locked once KYC is approved' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Clarke', description: 'Locked once KYC is approved' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({
    example: '+2348031234567',
    description: 'International format, or local format for the country chosen at KYC',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phoneNumber?: string;
}

export class ChannelPreferencesDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() salaryReceived?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() splitCompleted?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() transferUpdates?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() accountUpdates?: boolean;
}

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({ type: ChannelPreferencesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChannelPreferencesDto)
  push?: ChannelPreferencesDto;

  @ApiPropertyOptional({ type: ChannelPreferencesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChannelPreferencesDto)
  sms?: ChannelPreferencesDto;

  @ApiPropertyOptional({ type: ChannelPreferencesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChannelPreferencesDto)
  email?: ChannelPreferencesDto;
}

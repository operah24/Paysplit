import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { MAX_AMOUNT_MINOR, MIN_AMOUNT_MINOR } from '../../../shared/utils/money.util';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class SimulateCreditDto {
  @ApiProperty({ description: 'Kobo to credit (₦850,000 = 85000000)', example: 85000000 })
  @IsInt()
  @Min(MIN_AMOUNT_MINOR)
  @Max(MAX_AMOUNT_MINOR)
  amount: number;

  @ApiPropertyOptional({ example: 'Acme Ltd', description: 'Shown as "Transfer from …"' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  senderName?: string;

  @ApiPropertyOptional({ example: 'November salary' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  narration?: string;
}

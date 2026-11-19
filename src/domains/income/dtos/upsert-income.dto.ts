import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MAX_AMOUNT_MINOR, MIN_AMOUNT_MINOR } from '../../../shared/utils/money.util';

export class UpsertIncomeDto {
  @ApiProperty({ example: 'Talent Nation', maxLength: 120 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  employerName: string;

  @ApiProperty({
    description: 'Expected monthly salary in kobo (₦850,000 = 85000000)',
    example: 85000000,
  })
  @IsInt()
  @Min(MIN_AMOUNT_MINOR)
  @Max(MAX_AMOUNT_MINOR)
  monthlyAmount: number;

  @ApiProperty({
    description: 'Expected payday, day of month (1-31). 31 falls on the last day of short months.',
    example: 28,
    minimum: 1,
    maximum: 31,
  })
  @IsInt()
  @Min(1)
  @Max(31)
  paydayDay: number;
}

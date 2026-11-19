import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationDto } from '../../../shared/dtos/pagination.dto';
import { MAX_AMOUNT_MINOR, MIN_AMOUNT_MINOR } from '../../../shared/utils/money.util';
import { WALLET_ACCENT_COLOR_KEYS } from '../constants/wallet.constants';
import type { WalletAccentColor } from '../constants/wallet.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateWalletDto {
  @ApiProperty({ example: 'Children school fees', maxLength: 60 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @ApiProperty({ description: 'From GET /categories', format: 'uuid' })
  @IsUUID('4')
  categoryId: string;

  @ApiProperty({ enum: WALLET_ACCENT_COLOR_KEYS, example: 'green' })
  @IsIn(WALLET_ACCENT_COLOR_KEYS)
  accentColor: WalletAccentColor;

  @ApiPropertyOptional({
    description:
      'Goal in kobo (₦1,500,000 = 150000000). Omit or send null for "No targeted amount".',
    example: 150000000,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(MIN_AMOUNT_MINOR)
  @Max(MAX_AMOUNT_MINOR * 100)
  targetAmount?: number | null;
}

export class UpdateWalletDto extends PartialType(CreateWalletDto) {}

export class MoveWalletFundsDto {
  @ApiProperty({ description: 'Kobo to move back to the salary account', example: 5000000 })
  @IsInt()
  @Min(MIN_AMOUNT_MINOR)
  @Max(MAX_AMOUNT_MINOR)
  amount: number;
}

export class WalletTransactionsQuery extends PaginationDto {
  @ApiPropertyOptional({ enum: ['all', 'allocated', 'moved'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'allocated', 'moved'])
  filter?: 'all' | 'allocated' | 'moved';

  @ApiPropertyOptional({ description: 'Reference, narration or category' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class WalletActivityQuery extends PaginationDto {
  @ApiPropertyOptional({
    enum: ['all', 'in', 'out'],
    default: 'all',
    description: '"Money in" = allocations into wallets; "Money out" = moved back to salary',
  })
  @IsOptional()
  @IsIn(['all', 'in', 'out'])
  direction?: 'all' | 'in' | 'out';

  @ApiPropertyOptional({ description: 'Reference, wallet name or category' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

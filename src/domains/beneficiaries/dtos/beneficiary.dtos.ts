import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PaginationDto } from '../../../shared/dtos/pagination.dto';
import type { BeneficiaryStatus } from '../entities/beneficiary.entity';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ResolveAccountDto {
  @ApiProperty({ description: 'Bank `code` from GET /banks', example: '058' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  bankCode: string;

  @ApiProperty({ description: '10-digit NUBAN', example: '0123456789' })
  @Transform(trim)
  @Matches(/^\d{10}$/, { message: 'accountNumber must be exactly 10 digits' })
  accountNumber: string;
}

export class CreateBeneficiaryDto extends ResolveAccountDto {
  @ApiProperty({ description: 'From GET /categories', format: 'uuid' })
  @IsUUID('4')
  categoryId: string;

  @ApiPropertyOptional({ description: 'Payment narration / reference note', maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  narration?: string;
}

export class UpdateBeneficiaryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional({ maxLength: 100, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  narration?: string | null;

  @ApiPropertyOptional({ enum: ['active', 'paused'], description: 'Paused = skipped by splits' })
  @IsOptional()
  @IsIn(['active', 'paused'])
  status?: BeneficiaryStatus;
}

export class ListBeneficiariesQuery extends PaginationDto {
  @ApiPropertyOptional({ enum: ['all', 'active', 'paused'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'active', 'paused'])
  status?: 'all' | BeneficiaryStatus;

  @ApiPropertyOptional({ description: 'Name, bank or last digits of the account number' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class BeneficiaryTransactionsQuery extends PaginationDto {
  @ApiPropertyOptional({ description: 'Reference or narration' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

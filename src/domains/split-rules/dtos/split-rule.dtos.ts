import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationDto } from '../../../shared/dtos/pagination.dto';
import type {
  SplitRuleDestinationType,
  SplitRuleMethod,
  SplitRuleStatus,
} from '../entities/split-rule.entity';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const MAX_RULE_PRIORITY = 100;

export class CreateSplitRuleDto {
  @ApiProperty({ example: 'Payment for gbese', maxLength: 80 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @ApiProperty({
    description: `Lower runs first (1 before 10). 1-${MAX_RULE_PRIORITY}.`,
    example: 10,
  })
  @IsInt()
  @Min(1)
  @Max(MAX_RULE_PRIORITY)
  priority: number;

  @ApiProperty({
    enum: ['wallet', 'beneficiary'],
    description: '"Move to Wallet" / "Send to Beneficiary"',
  })
  @IsIn(['wallet', 'beneficiary'])
  destinationType: SplitRuleDestinationType;

  @ApiPropertyOptional({ format: 'uuid', description: 'Required when destinationType = wallet' })
  @ValidateIf((dto: CreateSplitRuleDto) => dto.destinationType === 'wallet')
  @IsUUID('4')
  walletId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required when destinationType = beneficiary',
  })
  @ValidateIf((dto: CreateSplitRuleDto) => dto.destinationType === 'beneficiary')
  @IsUUID('4')
  beneficiaryId?: string;

  @ApiProperty({
    enum: ['fixed', 'percentage'],
    description: '"Fix Amount (₦)" / "Percentage (%)"',
  })
  @IsIn(['fixed', 'percentage'])
  method: SplitRuleMethod;

  @ApiProperty({
    description:
      'fixed: kobo (₦30,000 = 3000000). percentage: percent of salary, up to 2 decimals (e.g. 20 or 12.5).',
    example: 3000000,
  })
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @IsPositive()
  value: number;

  @ApiPropertyOptional({ enum: ['active', 'paused'], default: 'active' })
  @IsOptional()
  @IsIn(['active', 'paused'])
  status?: SplitRuleStatus;
}

export class UpdateSplitRuleDto extends PartialType(CreateSplitRuleDto) {}

export class ListSplitRulesQuery extends PaginationDto {
  @ApiPropertyOptional({ enum: ['all', 'active', 'paused'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'active', 'paused'])
  status?: 'all' | SplitRuleStatus;

  @ApiPropertyOptional({ description: 'Rule or destination name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

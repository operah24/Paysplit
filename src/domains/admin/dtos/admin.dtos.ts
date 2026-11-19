import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from '../../../shared/dtos/pagination.dto';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const VERIFICATION_FILTERS = ['all', 'verified', 'unverified'] as const;
export type VerificationFilter = (typeof VERIFICATION_FILTERS)[number];

export class AdminListUsersQuery extends PaginationDto {
  @ApiPropertyOptional({ description: 'Name or email' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    enum: VERIFICATION_FILTERS,
    default: 'all',
    description: 'verified = KYC approved; unverified = everyone else',
  })
  @IsOptional()
  @IsIn(VERIFICATION_FILTERS)
  verification?: VerificationFilter;
}

export class AdminSalaryPaymentsQuery extends PaginationDto {
  @ApiPropertyOptional({ description: 'Employee name or email, reference or sender' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: ['pending', 'success', 'failed', 'reversed'] })
  @IsOptional()
  @IsIn(['pending', 'success', 'failed', 'reversed'])
  status?: 'pending' | 'success' | 'failed' | 'reversed';

  @ApiPropertyOptional({ description: 'Only this employee' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'From date (inclusive), YYYY-MM-DD, Lagos time' })
  @IsOptional()
  @Matches(DATE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ description: 'To date (inclusive), YYYY-MM-DD, Lagos time' })
  @IsOptional()
  @Matches(DATE, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}

export class UpdateAdminProfileDto {
  @ApiPropertyOptional({ example: 'Marcus' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Vance' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({
    example: '+2348031234567',
    description: 'International format, or Nigerian local format',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phoneNumber?: string;
}

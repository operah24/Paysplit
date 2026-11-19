import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../shared/dtos/pagination.dto';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class TransactionFilterQuery {
  @ApiPropertyOptional({
    enum: ['all', 'wallet', 'beneficiary', 'salary'],
    default: 'all',
    description: 'Tabs: All / Wallet / Beneficiary (salary = incoming credits only)',
  })
  @IsOptional()
  @IsIn(['all', 'wallet', 'beneficiary', 'salary'])
  type?: 'all' | 'wallet' | 'beneficiary' | 'salary';

  @ApiPropertyOptional({ enum: ['all', 'in', 'out'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'in', 'out'])
  direction?: 'all' | 'in' | 'out';

  @ApiPropertyOptional({ enum: ['pending', 'success', 'failed', 'reversed'] })
  @IsOptional()
  @IsIn(['pending', 'success', 'failed', 'reversed'])
  status?: 'pending' | 'success' | 'failed' | 'reversed';

  @ApiPropertyOptional({ description: 'Reference, destination, narration or category' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'From date (inclusive), YYYY-MM-DD, Lagos time' })
  @IsOptional()
  @Matches(DATE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ description: 'To date (inclusive), YYYY-MM-DD, Lagos time' })
  @IsOptional()
  @Matches(DATE, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}

export class ListTransactionsQuery extends IntersectionType(
  PaginationDto,
  TransactionFilterQuery,
) {}

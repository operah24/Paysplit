import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, Matches } from 'class-validator';
import { NIGERIA_METHODS, type NigeriaMethod } from '../constants/kyc.constants';

export class NigeriaIdentityDto {
  @ApiProperty({ description: 'Identity method', enum: NIGERIA_METHODS, example: 'bvn' })
  @IsIn(NIGERIA_METHODS)
  method: NigeriaMethod;

  @ApiProperty({ description: '11-digit BVN or NIN', example: '22234918239' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/\s+/g, '') : value,
  )
  @Matches(/^\d{11}$/, { message: 'idNumber must be 11 digits' })
  idNumber: string;
}

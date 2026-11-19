import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ResendCodeDto {
  @ApiProperty({ description: 'The email to resend the code to', example: 'paul@paysplit.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

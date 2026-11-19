import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'The email address associated with the account',
    example: 'paul@paysplit.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

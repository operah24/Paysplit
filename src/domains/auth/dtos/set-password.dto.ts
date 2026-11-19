import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import {
  PASSWORD_REGEX,
  PASSWORD_REGEX_MESSAGE,
} from '../../../shared/validators/password.validator';
import { Match } from '../../../shared/validators/match.validator';

export class SetPasswordDto {
  @ApiProperty({
    description:
      'The password — min 8 characters, must include uppercase, lowercase, digit, and special character',
    example: 'P@ssword123',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_REGEX_MESSAGE })
  @IsNotEmpty()
  password: string;

  @ApiProperty({ description: 'Must match password', example: 'P@ssword123' })
  @IsString()
  @IsNotEmpty()
  @Match('password', { message: 'Password and confirm password do not match' })
  confirmPassword: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import {
  PASSWORD_REGEX,
  PASSWORD_REGEX_MESSAGE,
} from '../../../shared/validators/password.validator';
import { Match } from '../../../shared/validators/match.validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldP@ssword1' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({
    description: 'Min 8 characters with uppercase, lowercase, digit and special character',
    example: 'NewP@ssword2',
  })
  @IsString()
  @MinLength(8)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_REGEX_MESSAGE })
  newPassword: string;

  @ApiProperty({ example: 'NewP@ssword2' })
  @IsString()
  @IsNotEmpty()
  @Match('newPassword', { message: 'New password and confirm password do not match' })
  confirmPassword: string;
}

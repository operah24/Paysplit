import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { THROTTLE_LIMITS } from '../../../shared/constants/throttle.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../users/entities/user.entity';
import { PROFILE_IMAGE_MAX_BYTES, ProfileImageService } from '../services/profile-image.service';
import { ProfileService } from '../services/profile.service';
import { UpdateNotificationPreferencesDto, UpdateProfileDto } from '../dtos/profile.dtos';

class ProfileImageUploadDto {
  @ApiProperty({ type: 'string', format: 'binary', description: 'PNG, JPG or WebP, max 5MB' })
  image!: unknown;
}

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class ProfileController {
  constructor(
    private readonly profileImageService: ProfileImageService,
    private readonly profileService: ProfileService,
  ) {}

  @Get('me/profile')
  @ApiOperation({
    summary:
      'Profile & Settings: user, account ID, member since, tier, account details, income, notification preferences',
  })
  getProfile(@CurrentUser() user: User) {
    return this.profileService.get(user);
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Edit personal details (first/last name, phone)',
    description:
      'Names are locked after KYC approval (409 NAME_LOCKED). Income is edited via PUT /setup/income.',
  })
  @ApiResponse({ status: 409, description: 'code NAME_LOCKED' })
  @ApiResponse({ status: 422, description: 'code INVALID_PHONE' })
  updateProfile(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.profileService.update(user, dto);
  }

  @Get('me/notification-preferences')
  @ApiOperation({ summary: 'Push / SMS / Email notification toggles' })
  getNotificationPreferences(@CurrentUser() user: User) {
    return this.profileService.getPreferences(user);
  }

  @Put('me/notification-preferences')
  @ApiOperation({
    summary: 'Update notification toggles (partial)',
    description: 'Only email is delivered today; push and SMS choices are stored for later.',
  })
  updateNotificationPreferences(
    @CurrentUser() user: User,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.profileService.updatePreferences(user, dto);
  }

  @Put('me/profile-image')
  @Throttle({ default: THROTTLE_LIMITS.PROFILE_IMAGE })
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: PROFILE_IMAGE_MAX_BYTES, files: 1 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ProfileImageUploadDto })
  @ApiOperation({ summary: 'Upload or replace the profile picture' })
  @ApiResponse({ status: 200, description: 'Returns the new `profileImageUrl`' })
  @ApiResponse({ status: 413, description: 'File larger than 5MB' })
  @ApiResponse({ status: 422, description: 'Missing file or not a PNG/JPG/WebP' })
  uploadProfileImage(@CurrentUser() user: User, @UploadedFile() image: Express.Multer.File) {
    return this.profileImageService.upload(user, image);
  }

  @Delete('me/profile-image')
  @Throttle({ default: THROTTLE_LIMITS.PROFILE_IMAGE })
  @ApiOperation({ summary: 'Remove the profile picture' })
  removeProfileImage(@CurrentUser() user: User) {
    return this.profileImageService.remove(user);
  }
}

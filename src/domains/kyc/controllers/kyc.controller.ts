import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { THROTTLE_LIMITS } from '../../../shared/constants/throttle.constants';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../users/entities/user.entity';
import { KycService } from '../services/kyc.service';
import { UpdateProfileDto } from '../dtos/update-profile.dto';
import { NigeriaIdentityDto } from '../dtos/nigeria-identity.dto';
import { SelfieUploadDto } from '../dtos/selfie-upload.dto';
import { KYC_MAX_IMAGE_BYTES } from '../constants/kyc.constants';
import { toValidatedImageBase64 } from '../utils/image.util';

const uploadLimits = { limits: { fileSize: KYC_MAX_IMAGE_BYTES, files: 1 } };

@ApiTags('kyc')
@Controller('kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Get('countries')
  @Throttle({ default: THROTTLE_LIMITS.LOOKUP })
  @ApiOperation({ summary: 'Supported countries (dial code, currency, allowed ID methods)' })
  getCountries() {
    return this.kycService.getCountries();
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'KYC progress for the "Complete KYC" stepper',
    description: 'Per-step status, attempts remaining and the step to resume at (`currentStep`).',
  })
  getStatus(@CurrentUser() user: User) {
    return this.kycService.getStatus(user.id);
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: THROTTLE_LIMITS.KYC_SUBMIT })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Step 1 — Profile Basics: country + mobile phone number' })
  @ApiResponse({ status: 200, description: 'Profile saved; returns KYC status' })
  @ApiResponse({ status: 400, description: 'Unsupported country or invalid phone number' })
  updateProfile(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.kycService.updateProfile(user.id, dto);
  }

  @Post('identity/nigeria')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: THROTTLE_LIMITS.KYC_SUBMIT })
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Step 2 (Nigeria) — verify BVN or NIN',
    description: 'Checks the number with Dojah and matches the name to the PaySplit account.',
  })
  @ApiResponse({ status: 200, description: 'Identity passed; proceed to liveness' })
  @ApiResponse({ status: 422, description: 'Not found / name mismatch (see `code`)' })
  @ApiResponse({ status: 429, description: 'Daily attempt limit reached' })
  @ApiResponse({ status: 503, description: 'Verification provider unavailable' })
  verifyNigeria(@CurrentUser() user: User, @Body() dto: NigeriaIdentityDto) {
    return this.kycService.verifyNigeriaIdentity(user.id, dto);
  }

  @Post('liveness')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: THROTTLE_LIMITS.KYC_SUBMIT })
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('selfie', uploadLimits))
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SelfieUploadDto })
  @ApiOperation({
    summary: 'Step 3 — biometric liveness ("Take shot")',
    description:
      'Runs a liveness check, then matches the selfie to the verified BVN/NIN record. ' +
      'On success KYC is approved and the response feeds the "Identity Approved" modal.',
  })
  @ApiResponse({ status: 200, description: 'Identity approved' })
  @ApiResponse({ status: 409, description: 'Identity step not completed yet' })
  @ApiResponse({ status: 422, description: 'No face / not live / face mismatch (see `code`)' })
  verifyLiveness(@CurrentUser() user: User, @UploadedFile() selfie: Express.Multer.File) {
    return this.kycService.verifyLiveness(user.id, toValidatedImageBase64(selfie, 'Selfie'));
  }
}

import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../decorators/admin-only.decorator';
import { AdminProfileService } from '../services/admin-profile.service';
import { UpdateAdminProfileDto } from '../dtos/admin.dtos';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../users/entities/user.entity';
import { ReqMeta } from '../../../shared/decorators/request-meta.decorator';
import type { RequestMeta } from '../../../shared/decorators/request-meta.decorator';

@ApiTags('admin')
@AdminOnly()
@Controller('admin/me')
export class AdminMeController {
  constructor(private readonly profile: AdminProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Admin card and personal details (email is read-only)' })
  get(@CurrentUser() admin: User) {
    return this.profile.get(admin);
  }

  @Patch()
  @ApiOperation({ summary: 'Update first name, last name or phone number (audited)' })
  @ApiResponse({ status: 422, description: 'code INVALID_PHONE' })
  update(
    @CurrentUser() admin: User,
    @Body() dto: UpdateAdminProfileDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.profile.update(admin, dto, meta);
  }
}

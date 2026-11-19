import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { THROTTLE_LIMITS } from '../../../shared/constants/throttle.constants';
import { CategoriesService } from '../services/categories.service';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @Throttle({ default: THROTTLE_LIMITS.LOOKUP })
  @ApiOperation({
    summary: 'List categories for wallets, beneficiaries and rules',
    description:
      'Fixed list with stable UUIDs (identical in every environment). Send the `id` as `categoryId`.',
  })
  @ApiResponse({ status: 200, description: '`[{ id, name, slug }]` in display order' })
  list() {
    return this.categoriesService.listSelectable();
  }
}

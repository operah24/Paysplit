import {
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { JobSecretGuard } from '../guards/job-secret.guard';
import { JOB_NAMES, JobName, JobsService } from '../services/jobs.service';

@ApiExcludeController()
@SkipThrottle()
@UseGuards(JobSecretGuard)
@Controller('internal/jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post(':name')
  @HttpCode(HttpStatus.OK)
  run(@Param('name') name: string) {
    if (!(JOB_NAMES as readonly string[]).includes(name)) throw new NotFoundException();
    return this.jobs.run(name as JobName);
  }
}

import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../decorators/admin-only.decorator';
import { AdminUsersService } from '../services/admin-users.service';
import { AdminSalaryPaymentsService } from '../services/admin-salary-payments.service';
import { AdminSalaryPaymentsQuery } from '../dtos/admin.dtos';

@ApiTags('admin')
@AdminOnly()
@Controller('admin')
export class AdminOverviewController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly salaryPayments: AdminSalaryPaymentsService,
  ) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Stat cards: total / verified / unverified users, verification rate, salary paid',
  })
  overview() {
    return this.users.overview();
  }

  @Get('salary-payments')
  @ApiOperation({ summary: 'Salary payments across all users ("Recent Salary Payment")' })
  listSalaryPayments(@Query() query: AdminSalaryPaymentsQuery) {
    return this.salaryPayments.list(query);
  }

  @Get('salary-payments/:reference')
  @ApiOperation({ summary: 'One salary payment with its receipt and provider reference' })
  @ApiResponse({ status: 404, description: 'code SALARY_PAYMENT_NOT_FOUND' })
  getSalaryPayment(@Param('reference') reference: string) {
    return this.salaryPayments.get(reference);
  }
}

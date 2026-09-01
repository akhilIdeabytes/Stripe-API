import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { Tenant } from '../tenants/entities/tenant.entity';

@ApiTags('reports')
@ApiBearerAuth('bearer')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('revenue')
  monthlyRevenue(
    @Query('year', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe)
    year: number,
    @CurrentTenant() tenant: Tenant | undefined,
  ) {
    return this.reports.monthlyRevenue(year, tenant?.id);
  }

  @Get('summary')
  summary(@CurrentTenant() tenant: Tenant | undefined) {
    return this.reports.summary(tenant?.id);
  }
}

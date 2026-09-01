import { Controller, Get, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('revenue')
  monthlyRevenue(
    @Query('year', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) year: number,
  ) {
    return this.reportsService.monthlyRevenue(year);
  }
}
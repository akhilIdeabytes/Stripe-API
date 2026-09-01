import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { RefundsService } from './refunds.service';
import { CreateRefundDto } from './dto/create-refund.dto';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';

/**
 * Refunds, reachable both by a source platform (X-API-Key) and by an
 * operator in the console (bearer JWT).
 */
@ApiTags('refunds')
@ApiBearerAuth('bearer')
@Controller('refunds')
export class RefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Optional key so a retried refund never issues twice.',
  })
  @Post()
  create(
    @Body() dto: CreateRefundDto,
    @CurrentTenant() tenant: Tenant | undefined,
    @CurrentUser() user: User | undefined,
  ) {
    return this.refunds.create(dto, tenant?.id, user?.id);
  }

  @Get()
  list(
    @CurrentTenant() tenant: Tenant | undefined,
    @Query('limit') limit?: string,
  ) {
    return this.refunds.list(tenant?.id, limit ? Number(limit) : undefined);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentTenant() tenant: Tenant | undefined,
  ) {
    return this.refunds.findById(id, tenant?.id);
  }

  @Get('payment/:paymentId')
  listForPayment(@Param('paymentId', ParseIntPipe) paymentId: number) {
    return this.refunds.listForPayment(paymentId);
  }

  /** Only while the refund is still `requires_action`. */
  @Post(':id/cancel')
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentTenant() tenant: Tenant | undefined,
  ) {
    return this.refunds.cancel(id, tenant?.id);
  }
}

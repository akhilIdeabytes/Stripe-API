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
import { PaymentsService } from './payments.service';
import {
  CapturePaymentDto,
  CreatePaymentDto,
  ListPaymentsQuery,
} from './dto/payment.dto';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { Tenant } from '../tenants/entities/tenant.entity';
import { resolveTenantId } from '../common/tenant.util';

const IDEMPOTENCY_DOC = {
  name: 'Idempotency-Key',
  required: false,
  description:
    'Optional key forwarded to Stripe so a retried request never creates a duplicate charge.',
};

/**
 * The payments API. Reachable two ways:
 *
 *  - a source platform, authenticating with X-API-Key (scoped to itself)
 *  - a console user, authenticating with a bearer JWT plus X-Tenant-Slug
 */
@ApiTags('payments')
@ApiBearerAuth('bearer')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @ApiHeader(IDEMPOTENCY_DOC)
  @Post()
  create(
    @Body() dto: CreatePaymentDto,
    @CurrentTenant() tenant: Tenant | undefined,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    resolveTenantId(tenant);
    return this.payments.create(tenant!, dto, idempotencyKey);
  }

  /**
   * Reconciles every in-flight payment with Stripe and reports what moved.
   * Use after a webhook outage, or to answer "is any of this stale?".
   */
  @Post('sync-all')
  syncAll(@CurrentTenant() tenant: Tenant | undefined) {
    return this.payments.syncAllFromStripe(tenant?.id);
  }

  @Get()
  list(
    @Query() query: ListPaymentsQuery,
    @CurrentTenant() tenant: Tenant | undefined,
  ) {
    // A console admin with no tenant selected sees everything; an API key
    // is always scoped to its own tenant.
    return this.payments.list(tenant?.id, query);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentTenant() tenant: Tenant | undefined,
  ) {
    return this.payments
      .findById(id, tenant?.id)
      .then((p) => this.payments.toPublic(p));
  }

  /** Live status, fees and receipt straight from Stripe. */
  @Get(':id/live')
  getLive(
    @Param('id', ParseIntPipe) id: number,
    @CurrentTenant() tenant: Tenant | undefined,
  ) {
    return this.payments.getLiveDetail(id, tenant?.id);
  }

  /** Takes funds held by a manual-capture authorization. */
  @Post(':id/capture')
  capture(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CapturePaymentDto,
    @CurrentTenant() tenant: Tenant | undefined,
  ) {
    return this.payments.capture(id, dto.amount, tenant?.id);
  }

  /**
   * Re-reads this payment from Stripe and updates the local record.
   * Use when a webhook was missed or has not arrived yet.
   */
  @Post(':id/sync')
  sync(
    @Param('id', ParseIntPipe) id: number,
    @CurrentTenant() tenant: Tenant | undefined,
  ) {
    return this.payments.syncFromStripe(id, tenant?.id);
  }

  /** Releases an authorization that will not be captured. */
  @Post(':id/cancel')
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentTenant() tenant: Tenant | undefined,
  ) {
    return this.payments.cancel(id, tenant?.id);
  }
}

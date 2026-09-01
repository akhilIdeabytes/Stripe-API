import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { ImportCustomersDto, SetupIntentDto } from './dto/customer-extras.dto';
import { CustomerSourcesService } from '../tenants/customer-sources.service';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { Tenant } from '../tenants/entities/tenant.entity';
import { resolveTenantId } from '../common/tenant.util';

@ApiTags('customers')
@ApiBearerAuth('bearer')
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly sources: CustomerSourcesService,
  ) {}

  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Optional key so a retry never creates a duplicate Stripe customer.',
  })
  @Post()
  create(
    @Body() dto: CreateCustomerDto,
    @CurrentTenant() tenant: Tenant | undefined,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.customers.create(resolveTenantId(tenant), dto, idempotencyKey);
  }

  @Get()
  findAll(@CurrentTenant() tenant: Tenant | undefined) {
    return this.customers.findAll(tenant?.id);
  }

  /**
   * Pulls the platform's customer list in and mirrors it here, creating a
   * Stripe customer for each so they can be charged later.
   */
  @Post('import')
  async importFromSource(
    @Body() dto: ImportCustomersDto,
    @CurrentTenant() tenant: Tenant | undefined,
  ) {
    const tenantId = resolveTenantId(tenant);

    // Either pull a configured feed by id, or a one-off url for testing.
    const source = dto.sourceId
      ? await this.sources.findById(dto.sourceId, tenantId)
      : { name: 'Ad-hoc URL', url: dto.url!, token: undefined };

    return this.customers.importFromSource(tenant!, source);
  }

  /**
   * Starts collecting a card or bank mandate to keep on file. Returns a
   * client secret the browser confirms with Stripe.js - nothing is
   * charged, the details are simply stored for later.
   */
  @Post(':id/setup-intent')
  createSetupIntent(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetupIntentDto,
    @CurrentTenant() tenant: Tenant | undefined,
  ) {
    return this.customers.createSetupIntent(id, dto.type ?? 'card', tenant?.id);
  }

  /** Cards and bank accounts already stored for this customer. */
  @Get(':id/payment-methods')
  listPaymentMethods(
    @Param('id', ParseIntPipe) id: number,
    @CurrentTenant() tenant: Tenant | undefined,
  ) {
    return this.customers.listPaymentMethods(id, tenant?.id);
  }

  @Delete(':id/payment-methods/:paymentMethodId')
  removePaymentMethod(
    @Param('id', ParseIntPipe) id: number,
    @Param('paymentMethodId') paymentMethodId: string,
    @CurrentTenant() tenant: Tenant | undefined,
  ) {
    return this.customers.removePaymentMethod(id, paymentMethodId, tenant?.id);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentTenant() tenant: Tenant | undefined,
  ) {
    return this.customers.findById(id, tenant?.id);
  }
}

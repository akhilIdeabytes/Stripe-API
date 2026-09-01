import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';
import { CustomerSourcesService } from './customer-sources.service';
import {
  CreateCustomerSourceDto,
  UpdateCustomerSourceDto,
} from './dto/customer-source.dto';
import { AdminOnly } from '../common/decorators/admin.decorator';

/**
 * Admin-only management of the source platforms. Portals authenticate with
 * an API key; they cannot reach these routes - only a signed-in admin can.
 */
@ApiTags('tenants')
@ApiBearerAuth('bearer')
@AdminOnly()
@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly sources: CustomerSourcesService,
  ) {}

  @Get()
  async findAll() {
    const all = await this.tenants.findAll();
    return all.map((t) => this.tenants.toPublic(t));
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tenants.toPublic(await this.tenants.findById(id));
  }

  /** The plaintext apiKey in this response is shown once and never again. */
  @Post()
  async create(@Body() dto: CreateTenantDto) {
    const { tenant, apiKey } = await this.tenants.create(dto);
    return { tenant: this.tenants.toPublic(tenant), apiKey };
  }

  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTenantDto) {
    return this.tenants.toPublic(await this.tenants.update(id, dto));
  }

  // ---- Customer feeds ---------------------------------------------------
  // A platform usually has several lists (Corporates, Employees, ...), so
  // each is configured separately and Import asks which one to pull.

  @Get(':id/customer-sources')
  async listSources(@Param('id', ParseIntPipe) id: number) {
    const list = await this.sources.listForTenant(id);
    return list.map((s) => this.sources.toPublic(s));
  }

  @Post(':id/customer-sources')
  async createSource(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCustomerSourceDto,
  ) {
    return this.sources.toPublic(await this.sources.create(id, dto));
  }

  @Patch(':id/customer-sources/:sourceId')
  async updateSource(
    @Param('id', ParseIntPipe) id: number,
    @Param('sourceId', ParseIntPipe) sourceId: number,
    @Body() dto: UpdateCustomerSourceDto,
  ) {
    return this.sources.toPublic(await this.sources.update(sourceId, dto, id));
  }

  @Delete(':id/customer-sources/:sourceId')
  removeSource(
    @Param('id', ParseIntPipe) id: number,
    @Param('sourceId', ParseIntPipe) sourceId: number,
  ) {
    return this.sources.remove(sourceId, id);
  }

  @Post(':id/rotate-key')
  async rotateKey(@Param('id', ParseIntPipe) id: number) {
    const { tenant, apiKey } = await this.tenants.rotateApiKey(id);
    return { tenant: this.tenants.toPublic(tenant), apiKey };
  }

  /**
   * Returns the webhook signing secret in plaintext so it can be copied
   * into the receiving platform. Admin-only, and deliberately a POST so
   * it is never triggered by a stray GET.
   */
  @Post(':id/reveal-webhook-secret')
  async revealWebhookSecret(@Param('id', ParseIntPipe) id: number) {
    const tenant = await this.tenants.findById(id);
    return { webhookSecret: tenant.webhookSecret ?? null };
  }

  @Post(':id/rotate-webhook-secret')
  async rotateWebhookSecret(@Param('id', ParseIntPipe) id: number) {
    const tenant = await this.tenants.rotateWebhookSecret(id);
    return { tenant: this.tenants.toPublic(tenant), webhookSecret: tenant.webhookSecret };
  }
}

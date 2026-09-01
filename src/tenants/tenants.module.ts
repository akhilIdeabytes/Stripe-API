import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { CustomerSource } from './entities/customer-source.entity';
import { TenantsService } from './tenants.service';
import { CustomerSourcesService } from './customer-sources.service';
import { TenantsController } from './tenants.controller';

// Global because the auth guard needs to resolve API keys on every request.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Tenant, CustomerSource])],
  providers: [TenantsService, CustomerSourcesService],
  controllers: [TenantsController],
  exports: [TenantsService, CustomerSourcesService],
})
export class TenantsModule {}

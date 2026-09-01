import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmConfig } from './config/typeorm.config';
import { StripeModule } from './stripe/stripe.module';
import { TenantsModule } from './tenants/tenants.module';
import { OutboundModule } from './outbound/outbound.module';
import { CustomersModule } from './customers/customers.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PaymentsModule } from './payments/payments.module';
import { RefundsModule } from './refunds/refunds.module';
import { PayoutsModule } from './payouts/payouts.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ReportsModule } from './reports/reports.module';
import { VersionModule } from './version/version.module';
import { PublicConfigModule } from './public-config/public-config.module';
import { CombinedAuthGuard } from './common/guards/combined-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Drives the outbound-webhook retry sweep.
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: typeOrmConfig,
    }),
    StripeModule,
    TenantsModule,
    OutboundModule,
    CustomersModule,
    InvoicesModule,
    PaymentsModule,
    RefundsModule,
    PayoutsModule,
    WebhooksModule,
    UsersModule,
    AuthModule,
    ReportsModule,
    VersionModule,
    PublicConfigModule,
  ],
  providers: [
    {
      // One gate for the whole API: @Public(), API key, or bearer JWT.
      provide: APP_GUARD,
      useClass: CombinedAuthGuard,
    },
  ],
})
export class AppModule {}

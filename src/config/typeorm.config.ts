import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Tenant } from '../tenants/entities/tenant.entity';
import { CustomerSource } from '../tenants/entities/customer-source.entity';
import { Customer } from '../customers/entities/customer.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Refund } from '../refunds/entities/refund.entity';
import { Payout } from '../payouts/entities/payout.entity';
import { User } from '../users/entities/user.entity';
import { WebhookDelivery } from '../outbound/entities/webhook-delivery.entity';
import { ProcessedEvent } from '../webhooks/entities/processed-event.entity';

export const typeOrmConfig = (config: ConfigService): TypeOrmModuleOptions => ({
  type: 'mysql',
  host: config.get<string>('DB_HOST'),
  port: config.get<number>('DB_PORT'),
  username: config.get<string>('DB_USERNAME'),
  password: config.get<string>('DB_PASSWORD'),
  database: config.get<string>('DB_NAME'),
  entities: [
    Tenant,
    CustomerSource,
    Customer,
    Payment,
    Invoice,
    Refund,
    Payout,
    User,
    WebhookDelivery,
    ProcessedEvent,
  ],
  // `synchronize: true` auto-creates tables from entities - fine while
  // iterating, but switch to real migrations before production. Note the
  // orders table is now unused and can be dropped by hand.
  synchronize: true,
  logging: false,
});

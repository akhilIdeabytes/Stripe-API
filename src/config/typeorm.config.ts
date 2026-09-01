import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Customer } from '../customers/entities/customer.entity';
import { Order } from '../orders/entities/order.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Refund } from '../refunds/entities/refund.entity';
import { Payout } from '../payouts/entities/payout.entity';
import { User } from '../users/entities/user.entity';

export const typeOrmConfig = (config: ConfigService): TypeOrmModuleOptions => ({
  type: 'mysql',
  host: config.get<string>('DB_HOST'),
  port: config.get<number>('DB_PORT'),
  username: config.get<string>('DB_USERNAME'),
  password: config.get<string>('DB_PASSWORD'),
  database: config.get<string>('DB_NAME'),
  entities: [Customer, Order, Payment, Refund, Payout, User],
  // `synchronize: true` auto-creates tables from entities - great for
  // getting started, but switch to real migrations before production.
  synchronize: true,
  logging: false,
});

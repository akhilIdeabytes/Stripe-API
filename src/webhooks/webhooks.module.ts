import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { PaymentsModule } from '../payments/payments.module';
import { RefundsModule } from '../refunds/refunds.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [PaymentsModule, RefundsModule, PayoutsModule, OrdersModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}

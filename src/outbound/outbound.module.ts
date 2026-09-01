import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { OutboundWebhooksService } from './outbound-webhooks.service';

// Global: payments, refunds and the Stripe webhook handler all emit events.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([WebhookDelivery])],
  providers: [OutboundWebhooksService],
  exports: [OutboundWebhooksService],
})
export class OutboundModule {}

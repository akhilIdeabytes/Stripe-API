import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { StripeService } from '../stripe/stripe.service';
import { PaymentsService } from '../payments/payments.service';
import { RefundsService } from '../refunds/refunds.service';
import { PayoutsService } from '../payouts/payouts.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentStatus } from '../payments/entities/payment.entity';
import { OrderStatus } from '../orders/entities/order.entity';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly stripe: StripeService,
    private readonly payments: PaymentsService,
    private readonly refunds: RefundsService,
    private readonly payouts: PayoutsService,
    private readonly orders: OrdersService,
  ) {}

  /**
   * Verifies the signature on the raw request body, then dispatches to a
   * handler based on event type. Unknown event types are logged and
   * ignored - Stripe will retry only on non-2xx responses, so we always
   * return normally for events we don't care about.
   */
  async handleEvent(rawBody: Buffer, signature: string): Promise<void> {
    const event = this.stripe.constructEvent(rawBody, signature);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'payment_intent.succeeded':
        await this.onPaymentIntentUpdated(
          event.data.object as Stripe.PaymentIntent,
          PaymentStatus.SUCCEEDED,
        );
        break;

      case 'payment_intent.processing':
        await this.onPaymentIntentUpdated(
          event.data.object as Stripe.PaymentIntent,
          PaymentStatus.PROCESSING,
        );
        break;

      case 'payment_intent.payment_failed':
        await this.onPaymentIntentUpdated(
          event.data.object as Stripe.PaymentIntent,
          PaymentStatus.FAILED,
        );
        break;

      case 'payment_intent.canceled':
        await this.onPaymentIntentUpdated(
          event.data.object as Stripe.PaymentIntent,
          PaymentStatus.CANCELED,
        );
        break;

      case 'refund.created':
      case 'refund.updated':
        await this.refunds.syncFromStripeRefund(event.data.object as Stripe.Refund);
        break;

      case 'payout.paid':
      case 'payout.failed':
      case 'payout.canceled':
      case 'payout.updated':
        await this.payouts.syncFromStripePayout(event.data.object as Stripe.Payout);
        break;

      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  private async onCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const payment = await this.payments.findByCheckoutSessionId(session.id);
    if (!payment) {
      this.logger.warn(`No local Payment found for checkout session ${session.id}`);
      return;
    }

    if (typeof session.payment_intent === 'string') {
      payment.stripePaymentIntentId = session.payment_intent;
    }
    payment.status = PaymentStatus.SUCCEEDED;
    await this.payments.saveEntity(payment);

    await this.orders.updateStatus(payment.orderId, OrderStatus.PAID);
  }

  private async onPaymentIntentUpdated(
    paymentIntent: Stripe.PaymentIntent,
    status: PaymentStatus,
  ): Promise<void> {
    const payment = await this.payments.findByPaymentIntentId(paymentIntent.id);
    if (!payment) {
      this.logger.warn(`No local Payment found for PaymentIntent ${paymentIntent.id}`);
      return;
    }

    payment.status = status;
    await this.payments.saveEntity(payment);

    if (status === PaymentStatus.SUCCEEDED) {
      await this.orders.updateStatus(payment.orderId, OrderStatus.PAID);
    }
  }
}

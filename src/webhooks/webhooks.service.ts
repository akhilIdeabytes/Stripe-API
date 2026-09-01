import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { StripeService } from '../stripe/stripe.service';
import { PaymentsService } from '../payments/payments.service';
import { RefundsService } from '../refunds/refunds.service';
import { PayoutsService } from '../payouts/payouts.service';
import { OutboundWebhooksService } from '../outbound/outbound-webhooks.service';
import { PaymentStatus } from '../payments/entities/payment.entity';
import { ProcessedEvent } from './entities/processed-event.entity';

/**
 * Inbound events from Stripe.
 *
 * This is where a bank debit finally becomes real: ACH and PAD settle
 * days after the customer confirms, and this handler is what turns that
 * into a local status change and a notification to the source platform.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectRepository(ProcessedEvent)
    private readonly processed: Repository<ProcessedEvent>,
    private readonly stripe: StripeService,
    private readonly payments: PaymentsService,
    private readonly refunds: RefundsService,
    private readonly payouts: PayoutsService,
    private readonly outbound: OutboundWebhooksService,
  ) {}

  async handleEvent(rawBody: Buffer, signature: string): Promise<void> {
    const event = this.stripe.constructEvent(rawBody, signature);

    // Stripe retries on any non-2xx and can deliver the same event more
    // than once even on success. Recording the id first makes every
    // handler below effectively exactly-once.
    const already = await this.processed.findOne({ where: { eventId: event.id } });
    if (already) {
      this.logger.debug(`Skipping duplicate Stripe event ${event.id}`);
      return;
    }
    await this.processed.save(
      this.processed.create({ eventId: event.id, eventType: event.type }),
    );

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await this.onCheckoutSession(event.data.object as Stripe.Checkout.Session);
        break;

      case 'checkout.session.async_payment_failed':
        await this.onCheckoutSessionFailed(event.data.object as Stripe.Checkout.Session);
        break;

      case 'payment_intent.succeeded':
      case 'payment_intent.processing':
      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled':
      case 'payment_intent.requires_action':
      // Fires when a manual-capture authorization is ready to be taken.
      case 'payment_intent.amount_capturable_updated':
        await this.onPaymentIntent(event.data.object as Stripe.PaymentIntent, event.type);
        break;

      case 'refund.created':
      case 'refund.updated':
      case 'charge.refund.updated':
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

  private async onCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
    const payment = await this.payments.findByCheckoutSessionId(session.id);
    if (!payment) {
      this.logger.warn(`No local Payment for checkout session ${session.id}`);
      return;
    }

    if (typeof session.payment_intent === 'string') {
      payment.stripePaymentIntentId = session.payment_intent;
    }

    // A session can complete while the money is still in flight. Only
    // 'paid' means the funds are actually there; 'unpaid' resolves later
    // as async_payment_succeeded or _failed.
    if (session.payment_status !== 'paid') {
      payment.status = PaymentStatus.PROCESSING;
      await this.payments.save(payment);
      await this.notify(payment.tenantId, 'payment.processing', payment.id);
      return;
    }

    // Re-read the intent so amountReceived and capture state are exact
    // rather than inferred from the session.
    if (payment.stripePaymentIntentId) {
      const intent = await this.stripe.retrievePaymentIntent(payment.stripePaymentIntentId);
      await this.payments.syncFromIntent(payment, intent);
    } else {
      payment.status = PaymentStatus.SUCCEEDED;
      payment.amountReceived = session.amount_total ?? payment.amount;
      await this.payments.save(payment);
    }

    await this.notify(payment.tenantId, 'payment.succeeded', payment.id);
  }

  private async onCheckoutSessionFailed(session: Stripe.Checkout.Session): Promise<void> {
    const payment = await this.payments.findByCheckoutSessionId(session.id);
    if (!payment) return;
    payment.status = PaymentStatus.FAILED;
    payment.failureReason = 'The bank declined or could not complete the debit.';
    await this.payments.save(payment);
    await this.notify(payment.tenantId, 'payment.failed', payment.id);
  }

  private async onPaymentIntent(
    intent: Stripe.PaymentIntent,
    eventType: string,
  ): Promise<void> {
    const payment = await this.payments.findByPaymentIntentId(intent.id);
    if (!payment) {
      this.logger.warn(`No local Payment for PaymentIntent ${intent.id}`);
      return;
    }

    await this.payments.syncFromIntent(payment, intent);

    const eventName: Record<string, string> = {
      'payment_intent.succeeded': 'payment.succeeded',
      'payment_intent.processing': 'payment.processing',
      'payment_intent.payment_failed': 'payment.failed',
      'payment_intent.canceled': 'payment.canceled',
      'payment_intent.requires_action': 'payment.requires_action',
      'payment_intent.amount_capturable_updated': 'payment.requires_capture',
    };

    await this.notify(payment.tenantId, eventName[eventType] ?? 'payment.updated', payment.id);
  }

  /** Re-reads the payment so the platform gets fully current figures. */
  private async notify(tenantId: number, eventType: string, paymentId: number) {
    const fresh = await this.payments.findById(paymentId).catch(() => null);
    if (!fresh) return;
    await this.outbound.emit(tenantId, eventType, this.payments.toEventPayload(fresh));
  }
}

import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { STRIPE_API_VERSION } from '../config/stripe.config';

/**
 * Thin wrapper around the Stripe SDK. Every call the rest of the app makes
 * to Stripe goes through here so:
 *  - the API key / client setup lives in exactly one place
 *  - idempotency keys are threaded through consistently
 *  - callers don't need to import the `stripe` package directly
 */
@Injectable()
export class StripeService {
  readonly client: Stripe;

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new InternalServerErrorException(
        'STRIPE_SECRET_KEY is not set - check your .env file',
      );
    }
    this.client = new Stripe(secretKey, {
      apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
    });
  }

  private opts(idempotencyKey?: string): Stripe.RequestOptions | undefined {
    return idempotencyKey ? { idempotencyKey } : undefined;
  }

  // ---- Customers ----------------------------------------------------

  createCustomer(
    params: Stripe.CustomerCreateParams,
    idempotencyKey?: string,
  ): Promise<Stripe.Customer> {
    return this.client.customers.create(params, this.opts(idempotencyKey));
  }

  retrieveCustomer(id: string): Promise<Stripe.Customer | Stripe.DeletedCustomer> {
    return this.client.customers.retrieve(id);
  }

  /**
   * A SetupIntent collects and stores a card or bank mandate WITHOUT
   * charging it. This is what makes "pay with the card on file" possible
   * later: the customer enters details once, Stripe keeps the token, and
   * we charge off-session from then on.
   */
  createSetupIntent(
    params: Stripe.SetupIntentCreateParams,
    idempotencyKey?: string,
  ): Promise<Stripe.SetupIntent> {
    return this.client.setupIntents.create(params, this.opts(idempotencyKey));
  }

  retrieveSetupIntent(id: string): Promise<Stripe.SetupIntent> {
    return this.client.setupIntents.retrieve(id);
  }

  /** Removes a stored payment method from the customer. */
  detachPaymentMethod(id: string): Promise<Stripe.PaymentMethod> {
    return this.client.paymentMethods.detach(id);
  }

  retrievePaymentMethod(id: string): Promise<Stripe.PaymentMethod> {
    return this.client.paymentMethods.retrieve(id);
  }

  updateCustomer(
    id: string,
    params: Stripe.CustomerUpdateParams,
  ): Promise<Stripe.Customer> {
    return this.client.customers.update(id, params);
  }

  /** Saved payment methods, used to authorize a customer off-session. */
  listCustomerPaymentMethods(
    customerId: string,
    type: Stripe.PaymentMethodListParams.Type = 'card',
  ): Promise<Stripe.ApiList<Stripe.PaymentMethod>> {
    return this.client.paymentMethods.list({ customer: customerId, type });
  }

  // ---- Checkout Sessions (card payments) -----------------------------

  createCheckoutSession(
    params: Stripe.Checkout.SessionCreateParams,
    idempotencyKey?: string,
  ): Promise<Stripe.Checkout.Session> {
    return this.client.checkout.sessions.create(params, this.opts(idempotencyKey));
  }

  retrieveCheckoutSession(
    id: string,
    expand: string[] = [],
  ): Promise<Stripe.Checkout.Session> {
    return this.client.checkout.sessions.retrieve(id, { expand });
  }

  listCheckoutSessionLineItems(
    id: string,
  ): Promise<Stripe.ApiList<Stripe.LineItem>> {
    return this.client.checkout.sessions.listLineItems(id);
  }

  // ---- PaymentIntents (bank-debit payments) --------------------------

  createPaymentIntent(
    params: Stripe.PaymentIntentCreateParams,
    idempotencyKey?: string,
  ): Promise<Stripe.PaymentIntent> {
    return this.client.paymentIntents.create(params, this.opts(idempotencyKey));
  }

  retrievePaymentIntent(
    id: string,
    expand: string[] = [],
  ): Promise<Stripe.PaymentIntent> {
    return this.client.paymentIntents.retrieve(id, { expand });
  }

  cancelPaymentIntent(id: string): Promise<Stripe.PaymentIntent> {
    return this.client.paymentIntents.cancel(id);
  }

  /** Takes funds that were authorized with capture_method: 'manual'. */
  capturePaymentIntent(
    id: string,
    params?: Stripe.PaymentIntentCaptureParams,
  ): Promise<Stripe.PaymentIntent> {
    return this.client.paymentIntents.capture(id, params);
  }

  // ---- Refunds --------------------------------------------------------

  createRefund(
    params: Stripe.RefundCreateParams,
    idempotencyKey?: string,
  ): Promise<Stripe.Refund> {
    return this.client.refunds.create(params, this.opts(idempotencyKey));
  }

  retrieveRefund(id: string): Promise<Stripe.Refund> {
    return this.client.refunds.retrieve(id);
  }

  cancelRefund(id: string): Promise<Stripe.Refund> {
    return this.client.refunds.cancel(id);
  }

  // ---- Payouts ----------------------------------------------------------

  createPayout(
    params: Stripe.PayoutCreateParams,
    idempotencyKey?: string,
  ): Promise<Stripe.Payout> {
    return this.client.payouts.create(params, this.opts(idempotencyKey));
  }

  retrievePayout(id: string): Promise<Stripe.Payout> {
    return this.client.payouts.retrieve(id);
  }

  listPayouts(params: Stripe.PayoutListParams = {}): Promise<Stripe.ApiList<Stripe.Payout>> {
    return this.client.payouts.list(params);
  }

  cancelPayout(id: string): Promise<Stripe.Payout> {
    return this.client.payouts.cancel(id);
  }

  // ---- Webhooks ---------------------------------------------------------

  /**
   * Verifies the signature on a raw webhook request body and returns the
   * parsed Stripe.Event. Throws Stripe.errors.StripeSignatureVerificationError
   * on failure - let that bubble up to the controller as a 400.
   */
  constructEvent(payload: string | Buffer, signature: string): Stripe.Event {
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new InternalServerErrorException(
        'STRIPE_WEBHOOK_SECRET is not set - check your .env file',
      );
    }
    return this.client.webhooks.constructEvent(payload, signature, webhookSecret);
  }
}

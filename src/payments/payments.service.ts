import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import { Payment, PaymentMethodType, PaymentStatus } from './entities/payment.entity';
import { StripeService } from '../stripe/stripe.service';
import { OrdersService } from '../orders/orders.service';
import { CustomersService } from '../customers/customers.service';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    private readonly stripe: StripeService,
    private readonly orders: OrdersService,
    private readonly customers: CustomersService,
    private readonly config: ConfigService,
  ) {}

  // ---- Card payments: Stripe Checkout -----------------------------------

  async createCheckoutSession(orderId: number, idempotencyKey?: string) {
    const order = await this.orders.findById(orderId);
    const frontendUrl = this.config.get<string>('FRONTEND_URL');

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] =
      order.items.map((item) => ({
        price_data: {
          currency: order.currency,
          product_data: { name: item.name },
          unit_amount: item.unitAmount,
        },
        quantity: item.quantity,
      }));

    const session = await this.stripe.createCheckoutSession(
      {
        mode: 'payment',
        line_items,
        shipping_address_collection: { allowed_countries: ['US', 'CA'] },
        success_url: `${frontendUrl}/complete?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendUrl}/cancel`,
        // Tie the Stripe object back to our order so the webhook handler
        // knows what to update.
        metadata: { orderId: order.id },
      },
      idempotencyKey,
    );

    const payment = this.payments.create({
      orderId: order.id,
      stripeCheckoutSessionId: session.id,
      paymentMethodType: PaymentMethodType.CARD,
      amount: order.amount,
      currency: order.currency,
      status: PaymentStatus.REQUIRES_PAYMENT_METHOD,
    });
    await this.payments.save(payment);

    return { url: session.url, sessionId: session.id };
  }

  async getCheckoutSessionDetails(sessionId: string) {
    const session = await this.stripe.retrieveCheckoutSession(sessionId, [
      'payment_intent.payment_method',
    ]);
    const lineItems = await this.stripe.listCheckoutSessionLineItems(sessionId);
    return { session, lineItems: lineItems.data };
  }

  // ---- Bank debit payments (ACH Direct Debit / PAD): raw PaymentIntent ---

  async createBankPaymentIntent(
    orderId: number,
    localCustomerId: number,
    paymentMethodType: 'us_bank_account' | 'acss_debit',
    idempotencyKey?: string,
  ) {
    const order = await this.orders.findById(orderId);
    const customer = await this.customers.findById(localCustomerId);

    const paymentMethodOptions: Stripe.PaymentIntentCreateParams.PaymentMethodOptions =
      paymentMethodType === 'us_bank_account'
        ? {
            us_bank_account: {
              // 'automatic' tries instant Financial Connections
              // verification first and falls back to microdeposits.
              verification_method: 'automatic',
            },
          }
        : {
            acss_debit: {
              mandate_options: {
                payment_schedule: 'sporadic',
                transaction_type: 'personal',
              },
            },
          };

    const intent = await this.stripe.createPaymentIntent(
      {
        amount: order.amount,
        currency: order.currency,
        customer: customer.stripeCustomerId,
        payment_method_types: [paymentMethodType],
        payment_method_options: paymentMethodOptions,
        metadata: { orderId: order.id },
      },
      idempotencyKey,
    );

    const payment = this.payments.create({
      orderId: order.id,
      stripePaymentIntentId: intent.id,
      paymentMethodType: paymentMethodType as PaymentMethodType,
      amount: order.amount,
      currency: order.currency,
      status: PaymentStatus.REQUIRES_PAYMENT_METHOD,
    });
    await this.payments.save(payment);

    // The client needs this to collect bank details and confirm the
    // PaymentIntent with stripe.js (mandate acceptance happens there).
    return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
  }

  // ---- Lookups ------------------------------------------------------

  async findById(id: number): Promise<Payment> {
    const payment = await this.payments.findOne({
      where: { id },
      relations: ['refunds'],
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  async findByCheckoutSessionId(sessionId: string): Promise<Payment | null> {
    return this.payments.findOne({
      where: { stripeCheckoutSessionId: sessionId },
    });
  }

  async findByPaymentIntentId(paymentIntentId: string): Promise<Payment | null> {
    return this.payments.findOne({
      where: { stripePaymentIntentId: paymentIntentId },
      relations: ['refunds'],
    });
  }

  // Fetch full, current detail straight from Stripe (fees, receipt url,
  // exact status) rather than just what we cached locally.
  async getLiveDetail(paymentIntentId: string) {
    return this.stripe.retrievePaymentIntent(paymentIntentId, [
      'payment_method',
      'latest_charge',
      'latest_charge.balance_transaction',
    ]);
  }

  async saveEntity(payment: Payment): Promise<Payment> {
    return this.payments.save(payment);
  }
}
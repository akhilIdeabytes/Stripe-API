import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  CaptureMethod,
  Payment,
  PaymentMethodType,
  PaymentStatus,
} from './entities/payment.entity';
import { StripeService } from '../stripe/stripe.service';
import { CustomersService } from '../customers/customers.service';
import { InvoicesService } from '../invoices/invoices.service';
import { OutboundWebhooksService } from '../outbound/outbound-webhooks.service';
import { CreatePaymentDto, ListPaymentsQuery } from './dto/payment.dto';
import { Tenant } from '../tenants/entities/tenant.entity';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    private readonly stripe: StripeService,
    private readonly customers: CustomersService,
    private readonly invoices: InvoicesService,
    private readonly outbound: OutboundWebhooksService,
    private readonly config: ConfigService,
  ) {}

  // ---- Creating payments ------------------------------------------------

  /**
   * Takes a payment for an arbitrary amount.
   *
   * Cards go through embedded Checkout (`ui_mode: 'embedded'`), which
   * returns a client secret rather than a redirect URL, so the form
   * renders inside the calling page - no link to copy, no second tab.
   *
   * Bank debits create a PaymentIntent directly; the client collects the
   * account details and mandate with Stripe.js.
   */
  async create(tenant: Tenant, dto: CreatePaymentDto, idempotencyKey?: string) {
    const currency = (dto.currency ?? tenant.defaultCurrency ?? 'usd').toLowerCase();
    const captureMethod =
      dto.captureMethod === 'manual' ? CaptureMethod.MANUAL : CaptureMethod.AUTOMATIC;

    if (captureMethod === CaptureMethod.MANUAL && dto.method !== 'card') {
      throw new BadRequestException(
        'Manual capture is only available for card payments - bank debits cannot be authorized and held.',
      );
    }

    const customer = dto.customerId
      ? await this.customers.findById(dto.customerId, tenant.id)
      : null;

    if (dto.method !== 'card' && !customer) {
      throw new BadRequestException(
        'Bank debits need a customerId - Stripe requires a customer to hold the mandate.',
      );
    }

    if (dto.paymentMethodId && !customer) {
      throw new BadRequestException(
        'Charging a stored payment method needs the customerId it belongs to.',
      );
    }

    // Write the local row FIRST, so a Stripe object can never exist
    // without a record of it. If the Stripe call then fails we mark the
    // row failed rather than leaving an untracked charge.
    const payment = await this.payments.save(
      this.payments.create({
        tenantId: tenant.id,
        externalReference: dto.externalReference,
        description: dto.description,
        customerId: customer?.id,
        customerEmail: dto.customerEmail ?? customer?.email,
        customerName: dto.customerName ?? customer?.name,
        paymentMethodType: dto.method as PaymentMethodType,
        captureMethod,
        amount: dto.amount,
        currency,
        status: PaymentStatus.REQUIRES_PAYMENT_METHOD,
      }),
    );

    try {
      const result = dto.paymentMethodId
        ? await this.chargeSavedMethod(
            payment,
            customer!.stripeCustomerId,
            dto.paymentMethodId,
            idempotencyKey,
          )
        : dto.method === 'card'
          ? await this.startCardCheckout(
              payment,
              tenant,
              customer?.stripeCustomerId,
              idempotencyKey,
              dto.savePaymentMethod,
            )
          : await this.startBankDebit(
              payment,
              customer!.stripeCustomerId,
              idempotencyKey,
              dto.savePaymentMethod,
            );

      if (dto.invoiceId) {
        await this.invoices.attachToPayment(dto.invoiceId, payment.id, tenant.id);
      }

      await this.outbound.emit(tenant.id, 'payment.created', this.toEventPayload(payment));

      return { ...this.toPublic(payment), ...result };
    } catch (err) {
      payment.status = PaymentStatus.FAILED;
      payment.failureReason =
        err instanceof Error ? err.message : 'Could not start the payment';
      await this.payments.save(payment);
      throw err;
    }
  }

  /**
   * Charges a method already on file, with the customer absent.
   *
   * `off_session: true` tells Stripe nobody is at the browser, so it will
   * not try to show a 3-D Secure challenge - it either succeeds or comes
   * back as requires_action for the customer to handle later.
   */
  private async chargeSavedMethod(
    payment: Payment,
    stripeCustomerId: string,
    paymentMethodId: string,
    idempotencyKey?: string,
  ) {
    const intent = await this.stripe.createPaymentIntent(
      {
        amount: payment.amount,
        currency: payment.currency,
        customer: stripeCustomerId,
        payment_method: paymentMethodId,
        description: payment.description,
        capture_method:
          payment.captureMethod === CaptureMethod.MANUAL ? 'manual' : 'automatic',
        confirm: true,
        off_session: true,
        metadata: this.stripeMetadata(payment),
      },
      idempotencyKey,
    );

    await this.syncFromIntent(payment, intent);

    return {
      kind: 'saved' as const,
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      // Nothing to render when this succeeded outright.
      requiresAction: payment.status === PaymentStatus.REQUIRES_ACTION,
    };
  }

  private async startCardCheckout(
    payment: Payment,
    tenant: Tenant,
    stripeCustomerId?: string,
    idempotencyKey?: string,
    savePaymentMethod?: boolean,
  ) {
    const frontendUrl = this.config.get<string>('FRONTEND_URL');

    const session = await this.stripe.createCheckoutSession(
      {
        mode: 'payment',
        ui_mode: 'embedded',
        line_items: [
          {
            price_data: {
              currency: payment.currency,
              product_data: { name: payment.description || 'Payment' },
              unit_amount: payment.amount,
            },
            quantity: 1,
          },
        ],
        customer: stripeCustomerId,
        customer_email: stripeCustomerId ? undefined : payment.customerEmail,
        payment_intent_data: {
          capture_method:
            payment.captureMethod === CaptureMethod.MANUAL ? 'manual' : 'automatic',
          description: payment.description,
          // Stores the card against the customer so later charges need no
          // details. Requires a customer to attach it to.
          ...(savePaymentMethod && stripeCustomerId
            ? { setup_future_usage: 'off_session' as const }
            : {}),
          metadata: this.stripeMetadata(payment, tenant),
        },
        return_url: `${frontendUrl}/payments/complete?session_id={CHECKOUT_SESSION_ID}`,
        metadata: this.stripeMetadata(payment, tenant),
      },
      idempotencyKey,
    );

    payment.stripeCheckoutSessionId = session.id;
    await this.payments.save(payment);

    return {
      kind: 'checkout' as const,
      clientSecret: session.client_secret,
      sessionId: session.id,
    };
  }

  private async startBankDebit(
    payment: Payment,
    stripeCustomerId: string,
    idempotencyKey?: string,
    savePaymentMethod?: boolean,
  ) {
    const type = payment.paymentMethodType;

    const paymentMethodOptions: Stripe.PaymentIntentCreateParams.PaymentMethodOptions =
      type === PaymentMethodType.US_BANK_ACCOUNT
        ? {
            us_bank_account: {
              // Tries instant Financial Connections verification first,
              // falls back to microdeposits.
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
        amount: payment.amount,
        currency: payment.currency,
        customer: stripeCustomerId,
        description: payment.description,
        payment_method_types: [type],
        payment_method_options: paymentMethodOptions,
        ...(savePaymentMethod ? { setup_future_usage: 'off_session' as const } : {}),
        metadata: this.stripeMetadata(payment),
      },
      idempotencyKey,
    );

    payment.stripePaymentIntentId = intent.id;
    await this.payments.save(payment);

    return {
      kind: 'intent' as const,
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
    };
  }

  // ---- Capture / cancel --------------------------------------------------

  /** Takes funds previously authorized with captureMethod: 'manual'. */
  async capture(id: number, amount: number | undefined, tenantId?: number) {
    const payment = await this.findById(id, tenantId);

    if (payment.status !== PaymentStatus.REQUIRES_CAPTURE) {
      throw new BadRequestException(
        `Only an authorized payment can be captured - this one is '${payment.status}'.`,
      );
    }
    if (!payment.stripePaymentIntentId) {
      throw new BadRequestException('This payment has no PaymentIntent to capture.');
    }
    if (amount !== undefined && amount > payment.amountCapturable) {
      throw new BadRequestException(
        `Cannot capture more than the authorized amount (${payment.amountCapturable}).`,
      );
    }

    const intent = await this.stripe.capturePaymentIntent(
      payment.stripePaymentIntentId,
      amount !== undefined ? { amount_to_capture: amount } : undefined,
    );

    await this.syncFromIntent(payment, intent);
    await this.outbound.emit(
      payment.tenantId,
      'payment.captured',
      this.toEventPayload(payment),
    );
    return this.toPublic(payment);
  }

  /** Releases an authorization that will not be captured. */
  async cancel(id: number, tenantId?: number) {
    const payment = await this.findById(id, tenantId);
    if (!payment.stripePaymentIntentId) {
      throw new BadRequestException('This payment has no PaymentIntent to cancel.');
    }

    const intent = await this.stripe.cancelPaymentIntent(payment.stripePaymentIntentId);
    await this.syncFromIntent(payment, intent);
    await this.outbound.emit(
      payment.tenantId,
      'payment.canceled',
      this.toEventPayload(payment),
    );
    return this.toPublic(payment);
  }

  // ---- Reconciliation ----------------------------------------------------

  /**
   * Pulls the current truth from Stripe and writes it locally.
   *
   * Status normally arrives by webhook, but a webhook can be missed,
   * delayed, or simply undeliverable (nothing reaches localhost unless
   * `stripe listen` is running). Without this the local row can sit at
   * requires_payment_method while Stripe has long since said succeeded.
   */
  async syncFromStripe(id: number, tenantId?: number) {
    const payment = await this.findById(id, tenantId);
    const before = payment.status;

    // A card payment only learns its PaymentIntent id from the session,
    // so resolve that first if we do not have it yet.
    if (!payment.stripePaymentIntentId && payment.stripeCheckoutSessionId) {
      const session = await this.stripe.retrieveCheckoutSession(
        payment.stripeCheckoutSessionId,
      );
      if (typeof session.payment_intent === 'string') {
        payment.stripePaymentIntentId = session.payment_intent;
        await this.payments.save(payment);
      } else if (session.payment_status === 'paid') {
        // Paid with no PaymentIntent (a zero-value or fully discounted
        // session): trust the session total.
        payment.status = PaymentStatus.SUCCEEDED;
        payment.amountReceived = session.amount_total ?? payment.amount;
        await this.payments.save(payment);
      }
    }

    if (payment.stripePaymentIntentId) {
      const intent = await this.stripe.retrievePaymentIntent(
        payment.stripePaymentIntentId,
      );
      await this.syncFromIntent(payment, intent);
    }

    if (payment.status !== before) {
      await this.outbound.emit(
        payment.tenantId,
        `payment.${payment.status}`,
        this.toEventPayload(payment),
      );
    }

    return this.toPublic(await this.findById(id, tenantId));
  }

  /**
   * Reconciles every payment that is not in a settled state and reports
   * exactly what moved.
   *
   * Returns a per-field before/after so the operator can see what the
   * Stripe response disagreed with, rather than just being told
   * "something changed".
   */
  async syncAllFromStripe(tenantId?: number) {
    const WATCHED = [
      'status',
      'amountReceived',
      'amountCapturable',
      'amountRefunded',
      'stripePaymentIntentId',
    ] as const;

    // Settled payments cannot move again, so skip them - this keeps the
    // number of Stripe calls proportional to what is actually in flight.
    const candidates = await this.payments
      .createQueryBuilder('payment')
      .where('payment.status NOT IN (:...settled)', {
        settled: [PaymentStatus.CANCELED, PaymentStatus.FAILED],
      })
      .andWhere(
        tenantId !== undefined ? 'payment.tenantId = :tenantId' : '1=1',
        tenantId !== undefined ? { tenantId } : {},
      )
      .orderBy('payment.createdAt', 'DESC')
      .take(200)
      .getMany();

    const changed: Array<{
      paymentId: number;
      externalReference: string | null;
      description: string | null;
      changes: Array<{ field: string; from: unknown; to: unknown }>;
    }> = [];
    const failures: Array<{ paymentId: number; message: string }> = [];

    for (const candidate of candidates) {
      const before: Record<string, unknown> = {};
      for (const field of WATCHED) before[field] = candidate[field] ?? null;

      try {
        await this.syncFromStripe(candidate.id, tenantId);
      } catch (err) {
        failures.push({
          paymentId: candidate.id,
          message: err instanceof Error ? err.message : 'Sync failed',
        });
        continue;
      }

      const after = await this.payments.findOne({ where: { id: candidate.id } });
      if (!after) continue;

      const diffs = WATCHED.filter(
        (field) => (after[field] ?? null) !== before[field],
      ).map((field) => ({
        field,
        from: before[field],
        to: after[field] ?? null,
      }));

      if (diffs.length) {
        changed.push({
          paymentId: after.id,
          externalReference: after.externalReference ?? null,
          description: after.description ?? null,
          changes: diffs,
        });
      }
    }

    return {
      checked: candidates.length,
      changedCount: changed.length,
      unchangedCount: candidates.length - changed.length - failures.length,
      changed,
      failures,
    };
  }

  // ---- Reads -------------------------------------------------------------

  async findById(id: number, tenantId?: number): Promise<Payment> {
    const payment = await this.payments.findOne({
      where: { id },
      relations: ['refunds', 'invoices'],
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (tenantId !== undefined && payment.tenantId !== tenantId) {
      throw new ForbiddenException('That payment belongs to another tenant');
    }
    return payment;
  }

  /**
   * Paginated list. The old API had no list endpoint at all, which is why
   * the console could only look payments up one id at a time.
   */
  async list(tenantId: number | undefined, query: ListPaymentsQuery) {
    const limit = Math.min(query.limit ?? 25, 100);
    const offset = query.offset ?? 0;

    const qb = this.payments
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.refunds', 'refund')
      .leftJoinAndSelect('payment.invoices', 'invoice')
      .orderBy('payment.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (tenantId !== undefined) {
      qb.andWhere('payment.tenantId = :tenantId', { tenantId });
    }
    if (query.status) {
      qb.andWhere('payment.status = :status', { status: query.status });
    }
    if (query.externalReference) {
      qb.andWhere('payment.externalReference = :ref', { ref: query.externalReference });
    }
    if (query.search) {
      const term = `%${query.search}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('payment.description LIKE :term', { term })
            .orWhere('payment.externalReference LIKE :term', { term })
            .orWhere('payment.customerEmail LIKE :term', { term })
            .orWhere('payment.customerName LIKE :term', { term })
            // Stripe ids too, so the console can resolve a payment from a
            // Checkout return_url or a PaymentIntent id.
            .orWhere('payment.stripeCheckoutSessionId LIKE :term', { term })
            .orWhere('payment.stripePaymentIntentId LIKE :term', { term });
        }),
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data: data.map((p) => this.toPublic(p)), total, limit, offset };
  }

  findByCheckoutSessionId(sessionId: string) {
    return this.payments.findOne({ where: { stripeCheckoutSessionId: sessionId } });
  }

  findByPaymentIntentId(paymentIntentId: string) {
    return this.payments.findOne({ where: { stripePaymentIntentId: paymentIntentId } });
  }

  /** Live detail straight from Stripe rather than the cached local copy. */
  async getLiveDetail(id: number, tenantId?: number) {
    const payment = await this.findById(id, tenantId);
    if (!payment.stripePaymentIntentId) {
      throw new BadRequestException('This payment has no PaymentIntent yet.');
    }
    return this.stripe.retrievePaymentIntent(payment.stripePaymentIntentId, [
      'payment_method',
      'latest_charge',
      'latest_charge.balance_transaction',
    ]);
  }

  // ---- Syncing from Stripe ----------------------------------------------

  /** Applies a Stripe PaymentIntent onto the local row. */
  async syncFromIntent(payment: Payment, intent: Stripe.PaymentIntent) {
    payment.status = this.mapIntentStatus(intent.status);
    payment.amountCapturable = intent.amount_capturable ?? 0;
    payment.amountReceived = intent.amount_received ?? 0;
    if (!payment.stripePaymentIntentId) payment.stripePaymentIntentId = intent.id;
    if (intent.last_payment_error?.message) {
      payment.failureReason = intent.last_payment_error.message;
    }
    return this.payments.save(payment);
  }

  private mapIntentStatus(status: Stripe.PaymentIntent.Status): PaymentStatus {
    const map: Record<string, PaymentStatus> = {
      requires_payment_method: PaymentStatus.REQUIRES_PAYMENT_METHOD,
      requires_confirmation: PaymentStatus.REQUIRES_CONFIRMATION,
      requires_action: PaymentStatus.REQUIRES_ACTION,
      processing: PaymentStatus.PROCESSING,
      requires_capture: PaymentStatus.REQUIRES_CAPTURE,
      canceled: PaymentStatus.CANCELED,
      succeeded: PaymentStatus.SUCCEEDED,
    };
    return map[status] ?? PaymentStatus.PROCESSING;
  }

  save(payment: Payment) {
    return this.payments.save(payment);
  }

  /** Recomputes the refunded total after a refund changes state. */
  async recalculateRefunded(paymentId: number) {
    const payment = await this.payments.findOne({
      where: { id: paymentId },
      relations: ['refunds'],
    });
    if (!payment) return;
    payment.amountRefunded = (payment.refunds ?? [])
      .filter((r) => r.status === 'succeeded' || r.status === 'pending')
      .reduce((sum, r) => sum + r.amount, 0);
    await this.payments.save(payment);
  }

  // ---- Shaping -----------------------------------------------------------

  /**
   * Stripe metadata values must be strings. Carrying the tenant and our
   * own id means a Stripe object can always be traced back here, even if
   * the webhook arrives before the local write is visible.
   */
  private stripeMetadata(payment: Payment, tenant?: Tenant): Record<string, string> {
    const meta: Record<string, string> = {
      paymentId: String(payment.id),
      tenantId: String(payment.tenantId),
    };
    if (tenant) meta.tenantSlug = tenant.slug;
    if (payment.externalReference) meta.externalReference = payment.externalReference;
    return meta;
  }

  /** The shape sent to source platforms in outbound webhooks. */
  toEventPayload(payment: Payment) {
    return {
      paymentId: payment.id,
      externalReference: payment.externalReference ?? null,
      status: payment.status,
      amount: payment.amount,
      amountReceived: payment.amountReceived,
      amountRefunded: payment.amountRefunded,
      currency: payment.currency,
      method: payment.paymentMethodType,
      description: payment.description ?? null,
      failureReason: payment.failureReason ?? null,
    };
  }

  toPublic(payment: Payment) {
    return {
      id: payment.id,
      tenantId: payment.tenantId,
      externalReference: payment.externalReference ?? null,
      description: payment.description ?? null,
      status: payment.status,
      method: payment.paymentMethodType,
      captureMethod: payment.captureMethod,
      amount: payment.amount,
      amountCapturable: payment.amountCapturable,
      amountReceived: payment.amountReceived,
      amountRefunded: payment.amountRefunded,
      refundableAmount: Math.max(0, payment.amountReceived - payment.amountRefunded),
      currency: payment.currency,
      customerId: payment.customerId ?? null,
      customerEmail: payment.customerEmail ?? null,
      customerName: payment.customerName ?? null,
      failureReason: payment.failureReason ?? null,
      stripePaymentIntentId: payment.stripePaymentIntentId ?? null,
      stripeCheckoutSessionId: payment.stripeCheckoutSessionId ?? null,
      refunds: payment.refunds ?? undefined,
      invoices: payment.invoices ?? undefined,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }
}

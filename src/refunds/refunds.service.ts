import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { Refund, RefundStatus } from './entities/refund.entity';
import { StripeService } from '../stripe/stripe.service';
import { PaymentsService } from '../payments/payments.service';
import { PaymentStatus } from '../payments/entities/payment.entity';
import { OutboundWebhooksService } from '../outbound/outbound-webhooks.service';
import { CreateRefundDto } from './dto/create-refund.dto';

@Injectable()
export class RefundsService {
  constructor(
    @InjectRepository(Refund)
    private readonly refunds: Repository<Refund>,
    private readonly stripe: StripeService,
    private readonly payments: PaymentsService,
    private readonly outbound: OutboundWebhooksService,
  ) {}

  /**
   * Issues a refund. Callable by a source platform over the API or by an
   * operator in the console - both land here.
   *
   * Preconditions are checked locally first so callers get a clear
   * message instead of a raw Stripe error.
   */
  async create(dto: CreateRefundDto, tenantId?: number, issuedByUserId?: number) {
    const payment = await this.payments.findById(dto.paymentId, tenantId);

    if (!payment.stripePaymentIntentId) {
      throw new BadRequestException('This payment has no PaymentIntent to refund.');
    }
    if (payment.status !== PaymentStatus.SUCCEEDED) {
      throw new BadRequestException(
        `Only a succeeded payment can be refunded - this one is '${payment.status}'.`,
      );
    }

    const refundable = payment.amountReceived - payment.amountRefunded;
    if (refundable <= 0) {
      throw new BadRequestException('This payment has already been fully refunded.');
    }
    const amount = dto.amount ?? refundable;
    if (amount > refundable) {
      throw new BadRequestException(
        `Cannot refund ${amount} - only ${refundable} remains refundable on this payment.`,
      );
    }

    const stripeRefund = await this.stripe.createRefund({
      payment_intent: payment.stripePaymentIntentId,
      amount,
      reason: dto.reason as Stripe.RefundCreateParams.Reason | undefined,
      metadata: { paymentId: String(payment.id), tenantId: String(payment.tenantId) },
    });

    const refund = await this.refunds.save(
      this.refunds.create({
        tenantId: payment.tenantId,
        paymentId: payment.id,
        stripeRefundId: stripeRefund.id,
        amount: stripeRefund.amount,
        currency: stripeRefund.currency,
        reason: stripeRefund.reason ?? undefined,
        note: dto.note,
        issuedByUserId,
        status: (stripeRefund.status as RefundStatus) ?? RefundStatus.PENDING,
      }),
    );

    await this.payments.recalculateRefunded(payment.id);
    await this.outbound.emit(payment.tenantId, 'refund.created', {
      refundId: refund.id,
      paymentId: payment.id,
      externalReference: payment.externalReference ?? null,
      amount: refund.amount,
      currency: refund.currency,
      status: refund.status,
    });

    return refund;
  }

  async findById(id: number, tenantId?: number): Promise<Refund> {
    const refund = await this.refunds.findOne({ where: { id } });
    if (!refund) throw new NotFoundException('Refund not found');
    if (tenantId !== undefined && refund.tenantId !== tenantId) {
      throw new ForbiddenException('That refund belongs to another tenant');
    }
    return refund;
  }

  listForPayment(paymentId: number) {
    return this.refunds.find({ where: { paymentId }, order: { createdAt: 'DESC' } });
  }

  list(tenantId?: number, limit = 50) {
    return this.refunds.find({
      where: tenantId !== undefined ? { tenantId } : {},
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 100),
    });
  }

  /**
   * Only succeeds while the refund is still `requires_action` - mainly
   * bank-debit refunds awaiting confirmation. Card refunds generally
   * cannot be cancelled once created.
   */
  async cancel(id: number, tenantId?: number) {
    const refund = await this.findById(id, tenantId);
    if (refund.status !== RefundStatus.REQUIRES_ACTION) {
      throw new BadRequestException(
        `Only a refund awaiting action can be cancelled - this one is '${refund.status}'.`,
      );
    }
    const stripeRefund = await this.stripe.cancelRefund(refund.stripeRefundId);
    refund.status = stripeRefund.status as RefundStatus;
    await this.refunds.save(refund);
    await this.payments.recalculateRefunded(refund.paymentId);
    return refund;
  }

  /** Keeps local state in step with Stripe, driven by inbound webhooks. */
  async syncFromStripeRefund(stripeRefund: Stripe.Refund): Promise<void> {
    const refund = await this.refunds.findOne({
      where: { stripeRefundId: stripeRefund.id },
    });
    if (!refund) return;

    refund.status = stripeRefund.status as RefundStatus;
    await this.refunds.save(refund);
    await this.payments.recalculateRefunded(refund.paymentId);

    const payment = await this.payments
      .findById(refund.paymentId)
      .catch(() => null);

    await this.outbound.emit(refund.tenantId, 'refund.updated', {
      refundId: refund.id,
      paymentId: refund.paymentId,
      externalReference: payment?.externalReference ?? null,
      amount: refund.amount,
      currency: refund.currency,
      status: refund.status,
    });
  }
}

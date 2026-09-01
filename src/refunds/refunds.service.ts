import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { Refund, RefundStatus } from './entities/refund.entity';
import { StripeService } from '../stripe/stripe.service';
import { Payment } from '../payments/entities/payment.entity';

@Injectable()
export class RefundsService {
  constructor(
    @InjectRepository(Refund)
    private readonly refunds: Repository<Refund>,
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    private readonly stripe: StripeService,
  ) {}

  async create(
    paymentId: number,
    amount: number | undefined,
    reason: string | undefined,
    idempotencyKey?: string,
  ): Promise<Refund> {
    const payment = await this.payments.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (!payment.stripePaymentIntentId) {
      throw new BadRequestException('Payment has no PaymentIntent to refund');
    }

    const stripeRefund = await this.stripe.createRefund(
      {
        payment_intent: payment.stripePaymentIntentId,
        amount, // undefined = full refund of the remaining amount
        reason: reason as Stripe.RefundCreateParams.Reason | undefined,
      },
      idempotencyKey,
    );

    const refund = this.refunds.create({
      paymentId: payment.id,
      stripeRefundId: stripeRefund.id,
      amount: stripeRefund.amount,
      currency: stripeRefund.currency,
      reason: stripeRefund.reason ?? undefined,
      status: stripeRefund.status as RefundStatus,
    });
    return this.refunds.save(refund);
  }

  async findById(id: number): Promise<Refund> {
    const refund = await this.refunds.findOne({ where: { id } });
    if (!refund) throw new NotFoundException('Refund not found');
    return refund;
  }

  async listForPayment(paymentId: number): Promise<Refund[]> {
    return this.refunds.find({ where: { paymentId }, order: { createdAt: 'DESC' } });
  }

  // Only succeeds while the refund is still `requires_action` (mainly
  // bank-debit refunds awaiting customer/bank confirmation). Card refunds
  // generally can't be cancelled once created.
  async cancel(id: number): Promise<Refund> {
    const refund = await this.findById(id);
    const stripeRefund = await this.stripe.cancelRefund(refund.stripeRefundId);
    refund.status = stripeRefund.status as RefundStatus;
    return this.refunds.save(refund);
  }

  // Used by the webhook handler to keep local status in sync with Stripe.
  async syncFromStripeRefund(stripeRefund: Stripe.Refund): Promise<void> {
    const refund = await this.refunds.findOne({
      where: { stripeRefundId: stripeRefund.id },
    });
    if (!refund) return;
    refund.status = stripeRefund.status as RefundStatus;
    await this.refunds.save(refund);
  }
}
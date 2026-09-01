import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { Payout, PayoutMethod, PayoutStatus } from './entities/payout.entity';
import { StripeService } from '../stripe/stripe.service';

/**
 * Payouts move money OUT of your Stripe balance into your OWN linked bank
 * account (the "push" side of bank transfers) via ACH credit / EFT.
 *
 * This is NOT how you send money to a third party such as a customer or
 * vendor - for that you need Stripe Connect (transfers to connected
 * accounts) or Stripe Treasury OutboundPayments. Kept separate from the
 * refunds module on purpose: refunding a charge and paying out your
 * balance are different operations with different APIs.
 */
@Injectable()
export class PayoutsService {
  constructor(
    @InjectRepository(Payout)
    private readonly payouts: Repository<Payout>,
    private readonly stripe: StripeService,
  ) {}

  async create(
    amount: number | undefined,
    currency: string | undefined,
    method: 'standard' | 'instant' | undefined,
    idempotencyKey?: string,
  ): Promise<Payout> {
    const stripePayout = await this.stripe.createPayout(
      {
        amount,
        currency: currency ?? 'usd',
        method,
      } as Stripe.PayoutCreateParams,
      idempotencyKey,
    );

    const payout = this.payouts.create({
      stripePayoutId: stripePayout.id,
      amount: stripePayout.amount,
      currency: stripePayout.currency,
      status: stripePayout.status as PayoutStatus,
      arrivalDate: new Date(stripePayout.arrival_date * 1000),
      method: (stripePayout.method as PayoutMethod) ?? PayoutMethod.STANDARD,
    });
    return this.payouts.save(payout);
  }

  async findById(id: number): Promise<Payout> {
    const payout = await this.payouts.findOne({ where: { id } });
    if (!payout) throw new NotFoundException('Payout not found');
    return payout;
  }

  async findByStripePayoutId(stripePayoutId: string): Promise<Payout | null> {
    return this.payouts.findOne({ where: { stripePayoutId } });
  }

  async findAll(): Promise<Payout[]> {
    return this.payouts.find({ order: { createdAt: 'DESC' }, take: 20 });
  }

  // Fetch full, current detail straight from Stripe rather than just what
  // we cached locally.
  async getLiveDetail(id: number) {
    const payout = await this.findById(id);
    return this.stripe.retrievePayout(payout.stripePayoutId);
  }

  // Only works while the payout status is still `pending`.
  async cancel(id: number): Promise<Payout> {
    const payout = await this.findById(id);
    const stripePayout = await this.stripe.cancelPayout(payout.stripePayoutId);
    payout.status = stripePayout.status as PayoutStatus;
    return this.payouts.save(payout);
  }

  // Used by the webhook handler to keep local status in sync with Stripe.
  async syncFromStripePayout(stripePayout: Stripe.Payout): Promise<void> {
    const payout = await this.payouts.findOne({
      where: { stripePayoutId: stripePayout.id },
    });
    if (!payout) return;
    payout.status = stripePayout.status as PayoutStatus;
    if (stripePayout.arrival_date) {
      payout.arrivalDate = new Date(stripePayout.arrival_date * 1000);
    }
    await this.payouts.save(payout);
  }
}

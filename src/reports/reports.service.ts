import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';

export interface MonthlyRevenue {
  month: number; // 1-12
  revenue: number; // smallest currency unit
  refunded: number;
  net: number;
  currency: string;
  count: number;
}

/**
 * Revenue now follows the money, not orders.
 *
 * It sums captured payments (amountReceived, so partial captures are
 * counted correctly) and subtracts refunds, giving a net figure.
 */
@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
  ) {}

  async monthlyRevenue(year: number, tenantId?: number): Promise<MonthlyRevenue[]> {
    const qb = this.payments
      .createQueryBuilder('payment')
      .select('MONTH(payment.createdAt)', 'month')
      .addSelect('payment.currency', 'currency')
      .addSelect('SUM(payment.amountReceived)', 'revenue')
      .addSelect('SUM(payment.amountRefunded)', 'refunded')
      .addSelect('COUNT(*)', 'count')
      .where('payment.status = :status', { status: PaymentStatus.SUCCEEDED })
      .andWhere('YEAR(payment.createdAt) = :year', { year })
      .groupBy('MONTH(payment.createdAt)')
      .addGroupBy('payment.currency');

    if (tenantId !== undefined) {
      qb.andWhere('payment.tenantId = :tenantId', { tenantId });
    }

    const rows = await qb.getRawMany();

    // Zero-fill so the UI can chart Jan-Dec without gaps. Mixed-currency
    // months keep whichever currency the data reports; totals across
    // currencies are never summed, since that would be meaningless.
    const byMonth = new Map<number, MonthlyRevenue>();
    for (let m = 1; m <= 12; m++) {
      byMonth.set(m, {
        month: m,
        revenue: 0,
        refunded: 0,
        net: 0,
        currency: 'usd',
        count: 0,
      });
    }
    for (const row of rows) {
      const revenue = Number(row.revenue) || 0;
      const refunded = Number(row.refunded) || 0;
      byMonth.set(Number(row.month), {
        month: Number(row.month),
        revenue,
        refunded,
        net: revenue - refunded,
        currency: row.currency,
        count: Number(row.count) || 0,
      });
    }
    return Array.from(byMonth.values());
  }

  /** Headline figures for the console dashboard. */
  async summary(tenantId?: number) {
    const qb = this.payments.createQueryBuilder('payment');
    if (tenantId !== undefined) {
      qb.where('payment.tenantId = :tenantId', { tenantId });
    }

    const all = await qb.getMany();
    const succeeded = all.filter((p) => p.status === PaymentStatus.SUCCEEDED);

    return {
      totalPayments: all.length,
      succeededCount: succeeded.length,
      processingCount: all.filter((p) => p.status === PaymentStatus.PROCESSING).length,
      awaitingCaptureCount: all.filter(
        (p) => p.status === PaymentStatus.REQUIRES_CAPTURE,
      ).length,
      failedCount: all.filter((p) => p.status === PaymentStatus.FAILED).length,
      grossReceived: succeeded.reduce((s, p) => s + p.amountReceived, 0),
      totalRefunded: succeeded.reduce((s, p) => s + p.amountRefunded, 0),
      netReceived: succeeded.reduce((s, p) => s + p.amountReceived - p.amountRefunded, 0),
      currency: succeeded[0]?.currency ?? 'usd',
    };
  }
}

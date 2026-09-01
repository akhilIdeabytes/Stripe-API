import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from '../orders/entities/order.entity';

export interface MonthlyRevenue {
  month: number; // 1-12
  revenue: number; // smallest currency unit, matching Order.amount
  currency: string;
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Order) private readonly ordersRepo: Repository<Order>,
  ) {}

  async monthlyRevenue(year: number): Promise<MonthlyRevenue[]> {
    const rows = await this.ordersRepo
      .createQueryBuilder('order')
      .select('MONTH(order.createdAt)', 'month')
      .addSelect('order.currency', 'currency')
      .addSelect('SUM(order.amount)', 'revenue')
      .where('order.status = :status', { status: OrderStatus.PAID })
      .andWhere('YEAR(order.createdAt) = :year', { year })
      .groupBy('MONTH(order.createdAt)')
      .addGroupBy('order.currency')
      .getRawMany();

    // Zero-fill every month so the UI can chart Jan-Dec without gaps.
    // If orders span multiple currencies, later months keep whichever
    // currency appears in the data; mixed-currency totals aren't summed
    // together since that would be meaningless.
    const byMonth = new Map<number, MonthlyRevenue>();
    for (let m = 1; m <= 12; m++) {
      byMonth.set(m, { month: m, revenue: 0, currency: 'usd' });
    }
    for (const row of rows) {
      byMonth.set(Number(row.month), {
        month: Number(row.month),
        revenue: Number(row.revenue),
        currency: row.currency,
      });
    }

    return Array.from(byMonth.values());
  }
}
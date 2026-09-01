import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orders: Repository<Order>,
  ) {}

  async create(dto: CreateOrderDto): Promise<Order> {
    const amount = dto.items.reduce(
      (sum, item) => sum + item.unitAmount * item.quantity,
      0,
    );

    const order = this.orders.create({
      customerId: dto.customerId,
      items: dto.items,
      amount,
      currency: dto.currency ?? 'usd',
      status: OrderStatus.PENDING,
    });
    return this.orders.save(order);
  }

  async findById(id: number): Promise<Order> {
    const order = await this.orders.findOne({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async findAll(): Promise<Order[]> {
    return this.orders.find({ order: { createdAt: 'DESC' } });
  }

  // Used by PaymentsService / WebhooksService to keep order status in sync
  // once a payment succeeds, fails, etc.
  async updateStatus(id: number, status: OrderStatus): Promise<Order> {
    const order = await this.findById(id);
    order.status = status;
    return this.orders.save(order);
  }
}

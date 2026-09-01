import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Customer } from '../../customers/entities/customer.entity';
import { Payment } from '../../payments/entities/payment.entity';

export interface OrderItem {
  name: string;
  // Smallest currency unit (e.g. cents for USD), matching Stripe's convention.
  unitAmount: number;
  quantity: number;
}

export enum OrderStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FULFILLED = 'fulfilled',
  CANCELED = 'canceled',
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  customerId?: number;

  @ManyToOne(() => Customer, (customer) => customer.orders, { nullable: true })
  @JoinColumn({ name: 'customerId' })
  customer?: Customer;

  @Column({ type: 'simple-json' })
  items: OrderItem[];

  // Total in the smallest currency unit - sum of unitAmount * quantity
  // across all items, computed when the order is created.
  @Column()
  amount: number;

  @Column({ default: 'usd' })
  currency: string;

  @Column({ type: 'varchar', default: OrderStatus.PENDING })
  status: OrderStatus;

  @OneToMany(() => Payment, (payment) => payment.order)
  payments: Payment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

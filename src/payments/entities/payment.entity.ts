import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Order } from '../../orders/entities/order.entity';
import { Refund } from '../../refunds/entities/refund.entity';

export enum PaymentMethodType {
  CARD = 'card',
  US_BANK_ACCOUNT = 'us_bank_account',
  ACSS_DEBIT = 'acss_debit',
}

// Mirrors Stripe's PaymentIntent.status values.
export enum PaymentStatus {
  REQUIRES_PAYMENT_METHOD = 'requires_payment_method',
  REQUIRES_CONFIRMATION = 'requires_confirmation',
  REQUIRES_ACTION = 'requires_action',
  PROCESSING = 'processing',
  REQUIRES_CAPTURE = 'requires_capture',
  CANCELED = 'canceled',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  orderId: number;

  @ManyToOne(() => Order, (order) => order.payments)
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Index({ unique: true })
  @Column({ nullable: true })
  stripeCheckoutSessionId?: string;

  @Index({ unique: true })
  @Column({ nullable: true })
  stripePaymentIntentId?: string;

  @Column({ type: 'varchar' })
  paymentMethodType: PaymentMethodType;

  @Column()
  amount: number;

  @Column({ default: 'usd' })
  currency: string;

  @Column({ type: 'varchar', default: PaymentStatus.REQUIRES_PAYMENT_METHOD })
  status: PaymentStatus;

  @OneToMany(() => Refund, (refund) => refund.payment)
  refunds: Refund[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

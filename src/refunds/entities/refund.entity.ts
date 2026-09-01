import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Payment } from '../../payments/entities/payment.entity';

// Mirrors Stripe's Refund.status values.
export enum RefundStatus {
  PENDING = 'pending',
  REQUIRES_ACTION = 'requires_action',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELED = 'canceled',
}

@Entity('refunds')
export class Refund {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  paymentId: number;

  @ManyToOne(() => Payment, (payment) => payment.refunds)
  @JoinColumn({ name: 'paymentId' })
  payment: Payment;

  @Index({ unique: true })
  @Column()
  stripeRefundId: string;

  @Column()
  amount: number;

  @Column({ default: 'usd' })
  currency: string;

  @Column({ nullable: true })
  reason?: string;

  @Column({ type: 'varchar', default: RefundStatus.PENDING })
  status: RefundStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

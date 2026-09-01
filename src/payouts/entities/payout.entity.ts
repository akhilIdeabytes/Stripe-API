import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Local mirror of a Stripe Payout object.
// Represents the "push" side: moving funds from your Stripe balance to your bank.

export enum PayoutStatus {
  PENDING = 'pending',
  IN_TRANSIT = 'in_transit',
  PAID = 'paid',
  FAILED = 'failed',
  CANCELED = 'canceled',
}

export enum PayoutMethod {
  STANDARD = 'standard',
  INSTANT = 'instant',
}

@Entity('payouts')
export class Payout {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column()
  stripePayoutId: string;

  @Column()
  amount: number;

  @Column({ default: 'usd' })
  currency: string;

  @Column({ type: 'varchar', default: PayoutStatus.PENDING })
  status: PayoutStatus;

  @Column({ type: 'datetime', nullable: true })
  arrivalDate?: Date;

  @Column({ type: 'varchar', default: PayoutMethod.STANDARD })
  method: PayoutMethod;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

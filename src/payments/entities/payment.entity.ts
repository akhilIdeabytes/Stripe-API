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
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { Refund } from '../../refunds/entities/refund.entity';
import { Invoice } from '../../invoices/entities/invoice.entity';

export enum PaymentMethodType {
  CARD = 'card',
  US_BANK_ACCOUNT = 'us_bank_account',
  ACSS_DEBIT = 'acss_debit',
}

/** Mirrors Stripe's PaymentIntent.status, plus a local 'failed'. */
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

export enum CaptureMethod {
  /** Charge immediately. */
  AUTOMATIC = 'automatic',
  /** Authorize now, capture later via POST /payments/:id/capture. */
  MANUAL = 'manual',
}

/**
 * A payment. This is the root object of the whole service.
 *
 * It carries its own amount and currency and does not require anything
 * else to exist first - a platform can simply say "charge 4200 CAD for
 * policy INS-2043". An invoice may be attached, and an
 * externalReference ties the payment back to the calling platform's own
 * record so both sides can reconcile.
 */
@Entity('payments')
@Index(['tenantId', 'createdAt'])
@Index(['tenantId', 'externalReference'])
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  /** Which source platform this payment belongs to. */
  @Column()
  tenantId: number;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  /**
   * The calling platform's own identifier - a policy number, an invoice
   * number, an application id. Not unique on its own (a platform may
   * retry or take several payments against one record), but indexed with
   * tenantId so reconciliation lookups are cheap.
   */
  @Column({ nullable: true })
  externalReference?: string;

  /** Free-text description shown to the customer on the payment form. */
  @Column({ nullable: true })
  description?: string;

  @Column({ nullable: true })
  customerId?: number;

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'customerId' })
  customer?: Customer;

  /** Contact details for a one-off payer with no stored Customer record. */
  @Column({ nullable: true })
  customerEmail?: string;

  @Column({ nullable: true })
  customerName?: string;

  @Index({ unique: true })
  @Column({ nullable: true })
  stripeCheckoutSessionId?: string;

  @Index({ unique: true })
  @Column({ nullable: true })
  stripePaymentIntentId?: string;

  @Column({ type: 'varchar' })
  paymentMethodType: PaymentMethodType;

  @Column({ type: 'varchar', default: CaptureMethod.AUTOMATIC })
  captureMethod: CaptureMethod;

  /** Requested amount, in the smallest currency unit. */
  @Column()
  amount: number;

  /** Held but not yet taken - non-zero only while status is requires_capture. */
  @Column({ default: 0 })
  amountCapturable: number;

  /** Actually captured. Differs from `amount` on a partial capture. */
  @Column({ default: 0 })
  amountReceived: number;

  /** Running total of succeeded refunds, kept so the UI can cap new ones. */
  @Column({ default: 0 })
  amountRefunded: number;

  @Column({ default: 'usd' })
  currency: string;

  @Column({ type: 'varchar', default: PaymentStatus.REQUIRES_PAYMENT_METHOD })
  status: PaymentStatus;

  /** Populated from Stripe when a payment fails, for display in the UI. */
  @Column({ type: 'text', nullable: true })
  failureReason?: string;

  @OneToMany(() => Refund, (refund) => refund.payment)
  refunds: Refund[];

  @OneToMany(() => Invoice, (invoice) => invoice.payment)
  invoices: Invoice[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

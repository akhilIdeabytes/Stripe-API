import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A source platform that takes payments through this service.
 *
 * One row per external application - e.g. the insurance platform that used
 * to run on Authorize.Net, and DG which used to run on PayPal. Each gets
 * its own API key for server-to-server calls, and its own callback URL so
 * we can notify it when a payment settles.
 *
 * Everything money-related (payments, refunds, invoices) is scoped to a
 * tenant, so one platform can never read or refund another's payments.
 */
@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn()
  id: number;

  /** Machine-readable identifier used in API responses, e.g. 'insurance'. */
  @Index({ unique: true })
  @Column()
  slug: string;

  @Column()
  name: string;

  /**
   * bcrypt hash of the API key. The plaintext key is shown exactly once,
   * at creation/rotation, and is never recoverable afterwards - same
   * treatment as a user password.
   */
  @Column()
  apiKeyHash: string;

  /** Last 4 characters of the key, so the UI can identify it in a list. */
  @Column({ nullable: true })
  apiKeyLast4?: string;

  /**
   * Where we POST payment/refund status changes. Bank debits take days to
   * settle, so the platform cannot learn the outcome from the original
   * charge response - it has to be told later.
   */
  @Column({ nullable: true })
  webhookUrl?: string;

  /**
   * Shared secret used to sign our outbound webhooks (HMAC-SHA256). The
   * receiving platform verifies this to be sure the callback is from us.
   */
  @Column({ nullable: true })
  webhookSecret?: string;

  // Customer feeds live in their own table now - see CustomerSource.
  // A platform usually has several (Corporates, Employees, ...), so a
  // single url/token pair on the tenant was never enough.

  @Column({ default: 'usd' })
  defaultCurrency: string;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

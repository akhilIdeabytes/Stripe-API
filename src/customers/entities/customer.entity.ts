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
import { Tenant } from '../../tenants/entities/tenant.entity';

// Local mirror of a Stripe Customer object, so the rest of the app can
// reference customers without round-tripping to Stripe on every request.
@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn()
  id: number;

  /** Owning platform. Scoping customers stops one tenant charging
      another's payer by guessing an integer id. */
  @Column()
  tenantId: number;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Index({ unique: true })
  @Column()
  stripeCustomerId: string;

  @Index()
  @Column()
  email: string;

  @Column({ nullable: true })
  name?: string;

  @Column({ nullable: true })
  phone?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

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
import { Tenant } from './tenant.entity';

/**
 * One named customer feed belonging to a platform.
 *
 * A platform rarely has just one list. The insurance platform exposes
 * Corporates and Employees separately; DG has its own. Each is a row
 * here, so Import can ask which one to pull rather than assuming a single
 * hardcoded endpoint.
 */
@Entity('customer_sources')
@Index(['tenantId', 'name'], { unique: true })
export class CustomerSource {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  /** Shown in the Import picker, e.g. 'Corporates' or 'Employees'. */
  @Column()
  name: string;

  @Column()
  url: string;

  /** Sent as `Authorization: Bearer <token>` when calling the feed. */
  @Column({ nullable: true })
  token?: string;

  /** Free-text note, e.g. 'gig + corp employees'. */
  @Column({ nullable: true })
  description?: string;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

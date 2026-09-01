import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum DeliveryStatus {
  PENDING = 'pending',
  DELIVERED = 'delivered',
  FAILED = 'failed',
}

/**
 * One attempt-tracked notification to a source platform. Kept as a table
 * rather than fire-and-forget so a platform that was down can be retried,
 * and so there is an audit trail of what we told whom.
 */
@Entity('webhook_deliveries')
@Index(['status', 'nextAttemptAt'])
export class WebhookDelivery {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @Column()
  eventType: string;

  @Column({ type: 'text' })
  payload: string;

  @Column({ type: 'varchar', default: DeliveryStatus.PENDING })
  status: DeliveryStatus;

  @Column({ default: 0 })
  attempts: number;

  @Column({ nullable: true })
  lastStatusCode?: number;

  @Column({ type: 'text', nullable: true })
  lastError?: string;

  @Column({ type: 'datetime', nullable: true })
  nextAttemptAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

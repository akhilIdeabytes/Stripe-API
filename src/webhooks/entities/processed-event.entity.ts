import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Every Stripe event id we have already handled.
 *
 * Stripe retries on any non-2xx and can redeliver even after success, so
 * without this a replayed 'payment_intent.succeeded' would re-run the
 * handlers and re-notify the source platform.
 */
@Entity('processed_events')
export class ProcessedEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column()
  eventId: string;

  @Column()
  eventType: string;

  @CreateDateColumn()
  processedAt: Date;
}

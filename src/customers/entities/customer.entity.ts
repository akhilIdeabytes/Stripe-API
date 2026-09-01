import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Order } from '../../orders/entities/order.entity';

// Local mirror of a Stripe Customer object, so the rest of the app can
// reference customers without round-tripping to Stripe on every request.
@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn()
  id: number;

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

  @OneToMany(() => Order, (order) => order.customer)
  orders: Order[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from './entities/customer.entity';
import { StripeService } from '../stripe/stripe.service';
import { CreateCustomerDto } from './dto/create-customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
    private readonly stripe: StripeService,
  ) {}

  async create(dto: CreateCustomerDto, idempotencyKey?: string): Promise<Customer> {
    const stripeCustomer = await this.stripe.createCustomer(
      { email: dto.email, name: dto.name, phone: dto.phone },
      idempotencyKey,
    );

    const customer = this.customers.create({
      stripeCustomerId: stripeCustomer.id,
      email: dto.email,
      name: dto.name,
      phone: dto.phone,
    });
    return this.customers.save(customer);
  }

  async findById(id: number): Promise<Customer> {
    const customer = await this.customers.findOne({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async findByStripeCustomerId(stripeCustomerId: string): Promise<Customer | null> {
    return this.customers.findOne({ where: { stripeCustomerId } });
  }

  async findAll(): Promise<Customer[]> {
    return this.customers.find({ order: { createdAt: 'DESC' } });
  }
}

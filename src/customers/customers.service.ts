import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from './entities/customer.entity';
import { StripeService } from '../stripe/stripe.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { Tenant } from '../tenants/entities/tenant.entity';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
    private readonly stripe: StripeService,
  ) {}

  async create(
    tenantId: number,
    dto: CreateCustomerDto,
    idempotencyKey?: string,
  ): Promise<Customer> {
    const stripeCustomer = await this.stripe.createCustomer(
      { email: dto.email, name: dto.name, phone: dto.phone },
      idempotencyKey,
    );

    const customer = this.customers.create({
      tenantId,
      stripeCustomerId: stripeCustomer.id,
      email: dto.email,
      name: dto.name,
      phone: dto.phone,
    });
    return this.customers.save(customer);
  }

  async findById(id: number, tenantId?: number): Promise<Customer> {
    const customer = await this.customers.findOne({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (tenantId !== undefined && customer.tenantId !== tenantId) {
      throw new ForbiddenException('That customer belongs to another tenant');
    }
    return customer;
  }

  async findByStripeCustomerId(stripeCustomerId: string): Promise<Customer | null> {
    return this.customers.findOne({ where: { stripeCustomerId } });
  }

  // ---- Stored payment methods -------------------------------------------

  /**
   * Starts collection of a card or bank mandate WITHOUT charging it.
   *
   * The browser confirms the returned client secret with Stripe.js; the
   * resulting payment method stays attached to the Stripe customer, so
   * every later charge can run off-session with nothing re-entered.
   */
  async createSetupIntent(
    id: number,
    type: 'card' | 'us_bank_account' | 'acss_debit',
    tenantId?: number,
  ) {
    const customer = await this.findById(id, tenantId);

    const intent = await this.stripe.createSetupIntent({
      customer: customer.stripeCustomerId,
      payment_method_types: [type],
      // The whole point: this method will be charged when the customer
      // is not in the browser.
      usage: 'off_session',
      ...(type === 'acss_debit'
        ? {
            payment_method_options: {
              acss_debit: {
                currency: 'cad',
                mandate_options: {
                  payment_schedule: 'sporadic',
                  transaction_type: 'personal',
                },
              },
            },
          }
        : {}),
    });

    return { clientSecret: intent.client_secret, setupIntentId: intent.id };
  }

  /** Cards and bank accounts already stored against this customer. */
  async listPaymentMethods(id: number, tenantId?: number) {
    const customer = await this.findById(id, tenantId);

    const types: Array<'card' | 'us_bank_account' | 'acss_debit'> = [
      'card',
      'us_bank_account',
      'acss_debit',
    ];

    const lists = await Promise.all(
      types.map((type) =>
        this.stripe
          .listCustomerPaymentMethods(customer.stripeCustomerId, type)
          .catch(() => ({ data: [] })),
      ),
    );

    return lists.flatMap((list) =>
      list.data.map((pm) => ({
        id: pm.id,
        type: pm.type,
        brand: pm.card?.brand ?? pm.us_bank_account?.bank_name ?? pm.acss_debit?.bank_name ?? null,
        last4: pm.card?.last4 ?? pm.us_bank_account?.last4 ?? pm.acss_debit?.last4 ?? null,
        expMonth: pm.card?.exp_month ?? null,
        expYear: pm.card?.exp_year ?? null,
      })),
    );
  }

  async removePaymentMethod(id: number, paymentMethodId: string, tenantId?: number) {
    const customer = await this.findById(id, tenantId);

    // Make sure the method really belongs to this customer before
    // detaching it - the id arrives from the client.
    const pm = await this.stripe.retrievePaymentMethod(paymentMethodId);
    if (pm.customer !== customer.stripeCustomerId) {
      throw new ForbiddenException('That payment method belongs to another customer');
    }

    await this.stripe.detachPaymentMethod(paymentMethodId);
    return { removed: true };
  }

  // ---- Importing from a platform feed -------------------------------------

  /**
   * Pulls one named feed (Corporates, Employees, ...) and mirrors it here,
   * creating a Stripe customer for each so they can be charged later.
   *
   * Existing customers are matched on email and left alone rather than
   * duplicated, so the import is safe to run repeatedly.
   */
  async importFromSource(
    tenant: Tenant,
    source: { name: string; url: string; token?: string },
  ) {
    let rows: Array<Record<string, unknown>>;
    try {
      const res = await fetch(source.url, {
        headers: source.token ? { Authorization: `Bearer ${source.token}` } : {},
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`The feed returned HTTP ${res.status}`);
      const body = await res.json();
      // Accept a bare array or the common { data: [...] } envelope.
      rows = Array.isArray(body) ? body : (body?.data ?? body?.customers ?? []);
    } catch (err) {
      throw new BadRequestException(
        `Could not read '${source.name}': ${err instanceof Error ? err.message : err}`,
      );
    }

    if (!Array.isArray(rows)) {
      throw new BadRequestException(
        `'${source.name}' must return a JSON array, or an object with a \`data\` array.`,
      );
    }

    const results = { imported: 0, skipped: 0, failed: 0, errors: [] as string[] };

    for (const row of rows) {
      const email = String(row.email ?? row.emailAddress ?? '').trim();
      if (!email) {
        results.failed++;
        results.errors.push('A row had no email and was skipped.');
        continue;
      }

      // Matching on email within the tenant keeps repeat runs safe.
      const existing = await this.customers.findOne({
        where: { email, tenantId: tenant.id },
      });
      if (existing) {
        results.skipped++;
        continue;
      }

      const name = (row.name ?? row.fullName ?? undefined) as string | undefined;
      const phone = (row.phone ?? row.phoneNumber ?? undefined) as string | undefined;

      try {
        const stripeCustomer = await this.stripe.createCustomer({ email, name, phone });
        await this.customers.save(
          this.customers.create({
            tenantId: tenant.id,
            stripeCustomerId: stripeCustomer.id,
            email,
            name,
            phone,
          }),
        );
        results.imported++;
      } catch (err) {
        results.failed++;
        results.errors.push(
          `${email}: ${err instanceof Error ? err.message : 'could not be created'}`,
        );
      }
    }

    return { source: source.name, total: rows.length, ...results };
  }

  async findAll(tenantId?: number): Promise<Customer[]> {
    return this.customers.find({
      where: tenantId !== undefined ? { tenantId } : {},
      order: { createdAt: 'DESC' },
    });
  }
}

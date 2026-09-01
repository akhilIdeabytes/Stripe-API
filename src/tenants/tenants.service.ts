import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Tenant } from './entities/tenant.entity';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';

const SALT_ROUNDS = 10;
const KEY_PREFIX = 'sk_portal_';

@Injectable()
export class TenantsService implements OnModuleInit {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenants: Repository<Tenant>,
  ) {}

  /**
   * Seeds the two known source platforms on first boot so there is
   * something to point at immediately. Only ever creates - never
   * overwrites an existing tenant, so keys you rotate stay rotated.
   */
  async onModuleInit() {
    const seeds = [
      { slug: 'insurance', name: 'Insurance Platform', defaultCurrency: 'cad' },
      { slug: 'dg', name: 'DG', defaultCurrency: 'usd' },
    ];
    for (const seed of seeds) {
      const existing = await this.tenants.findOne({ where: { slug: seed.slug } });
      if (existing) continue;
      await this.create(seed);
    }
  }

  /** Returns the tenant plus the PLAINTEXT key - the only time it exists. */
  async create(dto: CreateTenantDto) {
    const existing = await this.tenants.findOne({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException(`A tenant with slug '${dto.slug}' already exists`);
    }

    const apiKey = this.generateApiKey();
    const tenant = this.tenants.create({
      slug: dto.slug,
      name: dto.name,
      defaultCurrency: dto.defaultCurrency ?? 'usd',
      webhookUrl: dto.webhookUrl,
      webhookSecret: this.generateWebhookSecret(),
      apiKeyHash: await bcrypt.hash(apiKey, SALT_ROUNDS),
      apiKeyLast4: apiKey.slice(-4),
    });

    const saved = await this.tenants.save(tenant);
    return { tenant: saved, apiKey };
  }

  async update(id: number, dto: UpdateTenantDto) {
    const tenant = await this.findById(id);
    if (dto.name !== undefined) tenant.name = dto.name;
    if (dto.webhookUrl !== undefined) tenant.webhookUrl = dto.webhookUrl;
    if (dto.defaultCurrency !== undefined) tenant.defaultCurrency = dto.defaultCurrency;
    if (dto.active !== undefined) tenant.active = dto.active;
    return this.tenants.save(tenant);
  }

  /** Issues a new API key, invalidating the old one immediately. */
  async rotateApiKey(id: number) {
    const tenant = await this.findById(id);
    const apiKey = this.generateApiKey();
    tenant.apiKeyHash = await bcrypt.hash(apiKey, SALT_ROUNDS);
    tenant.apiKeyLast4 = apiKey.slice(-4);
    await this.tenants.save(tenant);
    return { tenant, apiKey };
  }

  async rotateWebhookSecret(id: number) {
    const tenant = await this.findById(id);
    tenant.webhookSecret = this.generateWebhookSecret();
    return this.tenants.save(tenant);
  }

  async findById(id: number): Promise<Tenant> {
    const tenant = await this.tenants.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  findBySlug(slug: string) {
    return this.tenants.findOne({ where: { slug } });
  }

  findAll() {
    return this.tenants.find({ order: { createdAt: 'ASC' } });
  }

  /**
   * Resolves a presented API key to its tenant.
   *
   * bcrypt hashes can't be looked up by value, so this compares against
   * each active tenant. That's fine at this scale (a handful of source
   * platforms) and keeps keys hashed at rest. If the tenant count ever
   * grows, add an indexed lookup prefix to the key rather than storing
   * it in plaintext.
   */
  async findByApiKey(apiKey: string): Promise<Tenant | null> {
    if (!apiKey || !apiKey.startsWith(KEY_PREFIX)) return null;

    const candidates = await this.tenants.find({ where: { active: true } });
    for (const tenant of candidates) {
      if (await bcrypt.compare(apiKey, tenant.apiKeyHash)) return tenant;
    }
    return null;
  }

  /** HMAC-SHA256 signature for an outbound webhook body. */
  signPayload(secret: string, payload: string): string {
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  /** Constant-time comparison, for platforms verifying our signature. */
  verifySignature(secret: string, payload: string, signature: string): boolean {
    const expected = this.signPayload(secret, payload);
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  /** Strips the key hash and webhook secret before returning over the API. */
  toPublic(tenant: Tenant) {
    const { apiKeyHash, webhookSecret, ...rest } = tenant;
    return { ...rest, hasWebhookSecret: !!webhookSecret };
  }

  private generateApiKey() {
    return `${KEY_PREFIX}${randomBytes(24).toString('hex')}`;
  }

  private generateWebhookSecret() {
    return `whsec_${randomBytes(24).toString('hex')}`;
  }
}

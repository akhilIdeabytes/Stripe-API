import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { DeliveryStatus, WebhookDelivery } from './entities/webhook-delivery.entity';
import { TenantsService } from '../tenants/tenants.service';

const MAX_ATTEMPTS = 8;
const TIMEOUT_MS = 10_000;

/**
 * Notifies the source platforms when something changes.
 *
 * This is the half of the integration that makes bank debits usable: ACH
 * and PAD take days to settle, so the original charge call cannot return
 * a final answer. The platform gets told later, here.
 *
 * Every request carries an HMAC-SHA256 signature over the exact body, so
 * the receiver can verify it came from us. Failures are retried with
 * exponential backoff rather than dropped.
 */
@Injectable()
export class OutboundWebhooksService {
  private readonly logger = new Logger(OutboundWebhooksService.name);

  constructor(
    @InjectRepository(WebhookDelivery)
    private readonly deliveries: Repository<WebhookDelivery>,
    private readonly tenants: TenantsService,
  ) {}

  /**
   * Queues an event for delivery. Never throws - a webhook problem must
   * not roll back the payment that triggered it.
   */
  async emit(tenantId: number, eventType: string, data: Record<string, unknown>) {
    try {
      const payload = JSON.stringify({
        type: eventType,
        createdAt: new Date().toISOString(),
        data,
      });

      const delivery = this.deliveries.create({
        tenantId,
        eventType,
        payload,
        status: DeliveryStatus.PENDING,
        nextAttemptAt: new Date(),
      });
      await this.deliveries.save(delivery);

      // Try immediately; the retry loop picks it up if this attempt fails.
      void this.attempt(delivery.id);
    } catch (err) {
      this.logger.error(`Could not queue ${eventType} for tenant ${tenantId}: ${err}`);
    }
  }

  /** Retry sweep for deliveries whose backoff has elapsed. */
  @Interval(60_000)
  async retryPending() {
    const due = await this.deliveries.find({
      where: {
        status: DeliveryStatus.PENDING,
        nextAttemptAt: LessThanOrEqual(new Date()),
      },
      order: { nextAttemptAt: 'ASC' },
      take: 25,
    });

    for (const delivery of due) await this.attempt(delivery.id);
  }

  private async attempt(deliveryId: number) {
    const delivery = await this.deliveries.findOne({ where: { id: deliveryId } });
    if (!delivery || delivery.status !== DeliveryStatus.PENDING) return;

    const tenant = await this.tenants.findById(delivery.tenantId).catch(() => null);
    if (!tenant?.webhookUrl || !tenant.webhookSecret) {
      // Nothing configured to deliver to - close it out rather than
      // retrying forever against a URL that does not exist.
      delivery.status = DeliveryStatus.FAILED;
      delivery.lastError = 'Tenant has no webhookUrl/webhookSecret configured';
      await this.deliveries.save(delivery);
      return;
    }

    delivery.attempts += 1;
    const signature = this.tenants.signPayload(tenant.webhookSecret, delivery.payload);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const res = await fetch(tenant.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Ledger-Signature': signature,
          'X-Ledger-Event': delivery.eventType,
          'X-Ledger-Delivery': String(delivery.id),
        },
        body: delivery.payload,
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      delivery.lastStatusCode = res.status;

      if (res.ok) {
        delivery.status = DeliveryStatus.DELIVERED;
        delivery.nextAttemptAt = undefined;
        delivery.lastError = undefined;
      } else {
        delivery.lastError = `HTTP ${res.status}`;
        this.scheduleRetry(delivery);
      }
    } catch (err) {
      delivery.lastError = err instanceof Error ? err.message : String(err);
      this.scheduleRetry(delivery);
    }

    await this.deliveries.save(delivery);
  }

  /** Exponential backoff: ~1m, 2m, 4m, 8m … capped, then give up. */
  private scheduleRetry(delivery: WebhookDelivery) {
    if (delivery.attempts >= MAX_ATTEMPTS) {
      delivery.status = DeliveryStatus.FAILED;
      delivery.nextAttemptAt = undefined;
      this.logger.warn(
        `Giving up on delivery ${delivery.id} (${delivery.eventType}) after ${delivery.attempts} attempts`,
      );
      return;
    }
    const delayMs = Math.min(2 ** delivery.attempts, 60) * 60_000;
    delivery.nextAttemptAt = new Date(Date.now() + delayMs);
  }

  listForTenant(tenantId: number) {
    return this.deliveries.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async redeliver(id: number) {
    const delivery = await this.deliveries.findOne({ where: { id } });
    if (!delivery) return null;
    delivery.status = DeliveryStatus.PENDING;
    delivery.attempts = 0;
    delivery.nextAttemptAt = new Date();
    await this.deliveries.save(delivery);
    void this.attempt(delivery.id);
    return delivery;
  }
}

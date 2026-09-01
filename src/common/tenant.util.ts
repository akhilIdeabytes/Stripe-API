import { BadRequestException } from '@nestjs/common';
import { Tenant } from '../tenants/entities/tenant.entity';

/**
 * Every money object belongs to exactly one tenant. API-key callers always
 * have one; a console user only does once they pick one (X-Tenant-Slug).
 * Failing loudly here beats writing a payment with a null owner.
 */
export function resolveTenantId(tenant: Tenant | undefined): number {
  if (!tenant) {
    throw new BadRequestException(
      'No tenant on this request. Send an X-Tenant-Slug header (console) or authenticate with an API key (platform).',
    );
  }
  return tenant.id;
}

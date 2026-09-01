import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * The Tenant a request belongs to.
 *
 * For API-key callers this is the platform that owns the key. For a
 * signed-in human it is whatever tenant they selected via the
 * `X-Tenant-Slug` header (admins can act on any tenant), or undefined.
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().tenant,
);

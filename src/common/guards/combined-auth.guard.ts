import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ADMIN_ONLY_KEY } from '../decorators/admin.decorator';
import { TenantsService } from '../../tenants/tenants.service';
import { UserRole } from '../../users/entities/user.entity';

/**
 * The single gate in front of the whole API. Three ways through:
 *
 *  1. @Public()          - no credentials at all (login, Stripe webhooks)
 *  2. X-API-Key header   - a source platform calling server-to-server
 *  3. Bearer JWT         - a human signed into the console
 *
 * Routes marked @AdminOnly() accept only case 3, with role === admin.
 *
 * On success `request.tenant` is set where one applies, so services can
 * scope every query without each controller re-deriving it.
 */
@Injectable()
export class CombinedAuthGuard extends AuthGuard('jwt') implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenants: TenantsService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const adminOnly = this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    // ---- Machine auth: a source platform ----
    if (typeof apiKey === 'string' && apiKey.length > 0) {
      if (adminOnly) {
        throw new ForbiddenException('This endpoint requires an administrator, not an API key');
      }
      const tenant = await this.tenants.findByApiKey(apiKey);
      if (!tenant) throw new UnauthorizedException('Invalid API key');
      request.tenant = tenant;
      request.authKind = 'api-key';
      return true;
    }

    // ---- Human auth: console user ----
    const ok = (await super.canActivate(context)) as boolean;
    if (!ok) return false;

    request.authKind = 'user';

    if (adminOnly && request.user?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Administrator access required');
    }

    // A console user can scope themselves to a tenant with a header. This
    // is how the UI takes a payment "as" the insurance platform.
    const slug = request.headers['x-tenant-slug'];
    if (typeof slug === 'string' && slug) {
      const tenant = await this.tenants.findBySlug(slug);
      if (!tenant) throw new ForbiddenException(`Unknown tenant '${slug}'`);
      request.tenant = tenant;
    }

    return true;
  }
}

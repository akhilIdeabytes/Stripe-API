import { SetMetadata } from '@nestjs/common';

export const ADMIN_ONLY_KEY = 'adminOnly';

/**
 * Restricts a route (or a whole controller) to signed-in users with the
 * admin role. API-key callers never satisfy this - portals are machines,
 * not administrators.
 */
export const AdminOnly = () => SetMetadata(ADMIN_ONLY_KEY, true);

import { registerAs } from '@nestjs/config';

// Pinned so behavior doesn't silently shift when Stripe releases a new
// default API version. Bump deliberately after checking the changelog.
export const STRIPE_API_VERSION = '2024-06-20';

export default registerAs('stripe', () => ({
  secretKey: process.env.STRIPE_SECRET_KEY,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  apiVersion: STRIPE_API_VERSION,
}));

import { ConfigService } from '@nestjs/config';

/**
 * Single source of truth for the JWT signing secret.
 *
 * Both the signer (AuthModule) and the verifier (JwtStrategy) must use the
 * exact same string - they previously each had their own hardcoded fallback
 * ('Secretkey' vs 'SecretKey'), which meant that with JWT_SECRET unset every
 * token would be signed with one value and verified against another, and
 * every authenticated request would 401.
 *
 * There is no fallback on purpose: a missing secret is a misconfiguration
 * that should stop the app at boot, not silently degrade auth.
 */
export function getJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET');
  if (!secret) {
    throw new Error('JWT_SECRET is not set - check your .env file');
  }
  return secret;
}

/** Token lifetime in seconds. Defaults to 24h. */
export function getJwtExpiresInSeconds(config: ConfigService): number {
  return Number(config.get<string>('JWT_EXPIRES_IN_SECONDS') ?? 86400);
}

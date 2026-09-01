import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';

/**
 * Client-safe configuration. Everything returned here is designed to be
 * public - the Stripe *publishable* key is meant to ship to browsers.
 * The secret key must never appear in this response.
 */
@ApiTags('config')
@Controller('config')
export class PublicConfigController {
  constructor(private readonly config: ConfigService) {}

  @Public()
  @Get()
  get() {
    return {
      stripePublishableKey:
        this.config.get<string>('STRIPE_PUBLISHABLE_KEY') ?? null,
      defaultCurrency: this.config.get<string>('DEFAULT_CURRENCY') ?? 'usd',
    };
  }
}

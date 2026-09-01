import { Global, Module } from '@nestjs/common';
import { StripeService } from './stripe.service';

// Global so every feature module can inject StripeService without each one
// having to re-import StripeModule individually.
@Global()
@Module({
  providers: [StripeService],
  exports: [StripeService],
})
export class StripeModule {}

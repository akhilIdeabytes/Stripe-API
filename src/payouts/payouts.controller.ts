import { Body, Controller, Get, Headers, Param, ParseIntPipe, Post } from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { ApiTags, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';

/**
 * Payouts move money OUT of your Stripe balance into your OWN linked bank
 * account (the "push" side of bank transfers) via ACH credit / EFT.
 *
 * This is NOT how you send money to a third party such as a customer or
 * vendor - for that you need Stripe Connect (transfers to connected
 * accounts) or Stripe Treasury OutboundPayments. Kept separate from the
 * refunds module on purpose: refunding a charge and paying out your
 * balance are different operations with different APIs.
 */
@ApiTags('payouts')
@ApiBearerAuth('bearer')
@Controller('payouts')
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Optional key forwarded to Stripe so a retried request never creates a duplicate payout.',
  })
  @Post()
  create(
    @Body() dto: CreatePayoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.payoutsService.create(
      dto.amount,
      dto.currency,
      dto.method,
      idempotencyKey,
    );
  }

  @Get()
  findAll() {
    return this.payoutsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.payoutsService.findById(id);
  }

  // Live, real-time detail straight from Stripe.
  @Get(':id/live')
  getLive(@Param('id', ParseIntPipe) id: number) {
    return this.payoutsService.getLiveDetail(id);
  }

  // Only works while the payout status is still `pending`.
  @Post(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.payoutsService.cancel(id);
  }
}

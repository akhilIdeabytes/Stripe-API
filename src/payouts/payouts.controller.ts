import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { CreatePayoutDto } from './dto/create-payout.dto';

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
@Controller('payouts')
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Post()
  create(@Body() dto: CreatePayoutDto) {
    return this.payoutsService.create(dto.amount, dto.currency, dto.method);
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

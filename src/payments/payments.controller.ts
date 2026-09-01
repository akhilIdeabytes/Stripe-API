import { Body, Controller, Get, Headers, Param, ParseIntPipe, Post } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { CreateBankPaymentDto } from './dto/create-bank-payment.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // Card payments -------------------------------------------------------

  @Post('checkout-session')
  createCheckoutSession(
    @Body() dto: CreateCheckoutSessionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.paymentsService.createCheckoutSession(dto.orderId, idempotencyKey);
  }

  @Get('session/:sessionId')
  getCheckoutSessionDetails(@Param('sessionId') sessionId: string) {
    return this.paymentsService.getCheckoutSessionDetails(sessionId);
  }

  // ACH Direct Debit / PAD bank payments --------------------------------

  @Post('bank-payment-intent')
  createBankPaymentIntent(
    @Body() dto: CreateBankPaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.paymentsService.createBankPaymentIntent(
      dto.orderId,
      dto.customerId,
      dto.paymentMethodType,
      idempotencyKey,
    );
  }

  // Payment details -----------------------------------------------------

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.paymentsService.findById(id);
  }

  // Live, real-time detail straight from Stripe (status, fees, receipt).
  @Get('intent/:paymentIntentId/live')
  async getLive(@Param('paymentIntentId') paymentIntentId: string) {
    return this.paymentsService.getLiveDetail(paymentIntentId);
  }
}
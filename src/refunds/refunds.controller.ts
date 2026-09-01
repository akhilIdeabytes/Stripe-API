import { Body, Controller, Get, Headers, Param, ParseIntPipe, Post } from '@nestjs/common';
import { RefundsService } from './refunds.service';
import { CreateRefundDto } from './dto/create-refund.dto';

@Controller('refunds')
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Post()
  create(
    @Body() dto: CreateRefundDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.refundsService.create(dto.paymentId, dto.amount, dto.reason, idempotencyKey);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.refundsService.findById(id);
  }

  @Get('payment/:paymentId')
  listForPayment(@Param('paymentId', ParseIntPipe) paymentId: number) {
    return this.refundsService.listForPayment(paymentId);
  }

  // Only succeeds while the refund is still `requires_action` (mainly
  // bank-debit refunds awaiting customer/bank confirmation).
  @Post(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.refundsService.cancel(id);
  }
}

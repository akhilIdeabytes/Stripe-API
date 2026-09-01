import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateRefundDto {
  /** Local Payment id. */
  @IsInt()
  paymentId: number;

  /** Omit to refund the full remaining amount. */
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @IsOptional()
  @IsIn(['duplicate', 'fraudulent', 'requested_by_customer'])
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';

  /** Internal note, kept locally and not sent to Stripe. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateRefundDto {
  @IsInt()
  paymentId: number; // local Payment id

  // Omit to refund the full remaining amount
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @IsOptional()
  @IsIn(['duplicate', 'fraudulent', 'requested_by_customer'])
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
}
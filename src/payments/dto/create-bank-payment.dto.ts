import { IsIn, IsInt } from 'class-validator';

export class CreateBankPaymentDto {
  @IsInt()
  orderId: number;

  @IsInt()
  customerId: number; // local Customer id (must already have a stripeCustomerId)

  // us_bank_account = US ACH Direct Debit, acss_debit = Canada PAD
  @IsIn(['us_bank_account', 'acss_debit'])
  paymentMethodType: 'us_bank_account' | 'acss_debit';
}

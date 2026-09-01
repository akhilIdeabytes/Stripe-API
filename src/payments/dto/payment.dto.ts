import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Take a payment. Nothing else has to exist first - the caller supplies
 * the amount and, optionally, its own reference so the two systems can be
 * reconciled later.
 */
export class CreatePaymentDto {
  /** Smallest currency unit: 4200 = $42.00. */
  @IsInt()
  @Min(50)
  amount: number;

  /** ISO-4217, lowercase. Defaults to the tenant's currency. */
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  /**
   * card         - Stripe Checkout, embedded in the page
   * us_bank_account - US ACH debit
   * acss_debit   - Canadian pre-authorized debit
   */
  @IsIn(['card', 'us_bank_account', 'acss_debit'])
  method: 'card' | 'us_bank_account' | 'acss_debit';

  /** Shown to the payer on the payment form. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  /** The calling platform's own id: policy number, invoice number, etc. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalReference?: string;

  /** Existing local Customer. Required for bank debits. */
  @IsOptional()
  @IsInt()
  customerId?: number;

  /** For a one-off payer with no stored Customer record. */
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  /**
   * 'manual' authorizes the funds without taking them - capture later via
   * POST /payments/:id/capture. Cards only; bank debits cannot be held.
   */
  @IsOptional()
  @IsIn(['automatic', 'manual'])
  captureMethod?: 'automatic' | 'manual';

  /** Attach an already-uploaded invoice (see POST /invoices). */
  @IsOptional()
  @IsInt()
  invoiceId?: number;

  /**
   * Charge a payment method already on file. With this set the payment is
   * confirmed off-session immediately - no form is shown and the customer
   * does not need to be present.
   */
  @IsOptional()
  @IsString()
  paymentMethodId?: string;

  /**
   * Keep the entered card or bank mandate for future off-session charges.
   * Ignored when paymentMethodId is used, since it is already saved.
   */
  @IsOptional()
  @IsBoolean()
  savePaymentMethod?: boolean;
}

export class CapturePaymentDto {
  /** Omit to capture the full authorized amount. */
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;
}

export class ListPaymentsQuery {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  externalReference?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

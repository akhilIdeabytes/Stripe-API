import { IsInt, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Metadata accompanying an upload. Sent as multipart form fields, so
 * everything arrives as a string - @Type coerces the numeric ones.
 */
export class CreateInvoiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  invoiceNumber?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  paymentId?: number;

  /** Use instead of a file when the invoice already lives elsewhere. */
  @IsOptional()
  @IsUrl({ require_tld: false })
  externalUrl?: string;
}

export class AttachInvoiceDto {
  @IsInt()
  invoiceId: number;
}

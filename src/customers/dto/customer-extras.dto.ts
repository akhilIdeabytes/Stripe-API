import { IsIn, IsInt, IsOptional, IsUrl } from 'class-validator';

export class SetupIntentDto {
  /** What to store. Defaults to a card. */
  @IsOptional()
  @IsIn(['card', 'us_bank_account', 'acss_debit'])
  type?: 'card' | 'us_bank_account' | 'acss_debit';
}

export class ImportCustomersDto {
  /** Which configured feed to pull (Corporates, Employees, ...). */
  @IsOptional()
  @IsInt()
  sourceId?: number;

  /** A one-off URL instead, for testing a feed before saving it. */
  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string;
}

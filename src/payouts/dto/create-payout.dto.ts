import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreatePayoutDto {
  // Required: Stripe's Payout API has no "full available balance" mode,
  // both amount and currency must be supplied. This used to be optional,
  // which meant a blank amount reached Stripe and came back as a 400.
  @IsInt()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsIn(['standard', 'instant'])
  method?: 'standard' | 'instant';
}

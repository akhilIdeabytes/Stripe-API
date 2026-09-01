import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreatePayoutDto {
  // Omit to pay out the full available balance.
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsIn(['standard', 'instant'])
  method?: 'standard' | 'instant';
}

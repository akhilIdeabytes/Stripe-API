import { IsBoolean, IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';

export class CreateTenantDto {
  /** Machine identifier, lowercase, e.g. 'insurance' or 'dg'. */
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,30}$/, {
    message: 'slug must be lowercase letters, numbers or dashes',
  })
  slug: string;

  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  defaultCurrency?: string;

  /** Where we POST payment/refund status changes. */
  @IsOptional()
  @IsUrl({ require_tld: false })
  webhookUrl?: string;

}

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  webhookUrl?: string;

  @IsOptional()
  @IsString()
  defaultCurrency?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

}

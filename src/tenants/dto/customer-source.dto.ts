import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateCustomerSourceDto {
  /** Shown in the Import picker, e.g. 'Corporates'. */
  @IsString()
  @MaxLength(80)
  name: string;

  @IsUrl({ require_tld: false })
  url: string;

  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

export class UpdateCustomerSourceDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string;

  /** Leave blank to keep the stored token. */
  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

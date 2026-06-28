import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  npwp?: string; // FR-4.2 e-Faktur

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  credit_limit?: number; // FR-2.4 (0 = unlimited)

  @IsOptional()
  @IsNumber()
  @Min(0)
  term_of_payment_days?: number;
}

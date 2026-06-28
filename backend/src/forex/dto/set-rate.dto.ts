import { IsISO8601, IsNumber, IsString, Length, Min } from 'class-validator';

export class SetRateDto {
  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsISO8601()
  rate_date!: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  rate!: number; // IDR per 1 unit of currency
}

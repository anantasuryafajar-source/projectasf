import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

// Mirrors the §7.1 sales-invoice item payload.
export class SalesInvoiceItemDto {
  @IsString()
  sku!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity!: number;

  @IsString()
  uom!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  conversion_to_base!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unit_price!: number;

  @IsBoolean()
  taxable!: boolean;

  @IsOptional()
  @IsString()
  batch_number?: string;

  @IsOptional()
  @IsISO8601()
  expiry_date?: string;
}

// Mirrors the §7.1 sales-invoice payload. Note: customer_id / warehouse_id
// carry business codes (e.g. CUST-BRW-099, WH-KEBAGUSAN-01) per the PRD sample.
export class CreateSalesInvoiceDto {
  @IsOptional()
  @IsUUID()
  idempotency_key?: string;

  @IsString()
  invoice_number!: string;

  @IsISO8601()
  transaction_date!: string;

  @IsString()
  customer_id!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  term_of_payment_days?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  exchange_rate?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesInvoiceItemDto)
  items!: SalesInvoiceItemDto[];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount_total?: number;

  @IsString()
  warehouse_id!: string;
}

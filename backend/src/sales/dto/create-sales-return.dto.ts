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

export class SalesReturnItemDto {
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

  @IsString()
  batch_number!: string; // batch to restock into (FR-3.5)

  @IsISO8601()
  expiry_date!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unit_cost?: number; // used only when the batch does not already exist
}

export class CreateSalesReturnDto {
  @IsOptional()
  @IsUUID()
  idempotency_key?: string;

  @IsString()
  return_number!: string;

  @IsISO8601()
  return_date!: string;

  @IsString()
  original_invoice_number!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount_total?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesReturnItemDto)
  items!: SalesReturnItemDto[];
}

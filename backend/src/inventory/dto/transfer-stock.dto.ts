import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class TransferStockItemDto {
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

  @IsString()
  batch_number!: string;

  @IsISO8601()
  expiry_date!: string;
}

/** Internal stock movement between warehouses (FR-3.3, no P&L). */
export class TransferStockDto {
  @IsOptional()
  @IsUUID()
  idempotency_key?: string;

  @IsString()
  transfer_number!: string;

  @IsISO8601()
  transfer_date!: string;

  @IsString()
  from_warehouse_code!: string;

  @IsString()
  to_warehouse_code!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransferStockItemDto)
  items!: TransferStockItemDto[];
}

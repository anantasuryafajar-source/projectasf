import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

/**
 * Receive stock into a batch (FR-3.5). quantity may be given in any defined
 * UOM; it is converted to the product base unit before storage (FR-3.4).
 * unit_cost is per BASE unit, used for valuation (FR-3.1).
 */
export class ReceiveStockDto {
  @IsUUID()
  product_id!: string;

  @IsUUID()
  warehouse_id!: string;

  @IsString()
  batch_number!: string;

  @IsISO8601()
  expiry_date!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity!: number;

  @IsOptional()
  @IsString()
  uom?: string; // defaults to product base_uom

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unit_cost!: number; // per base unit, in IDR
}

import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

/**
 * Deplete stock FIFO by expiry (FR-3.5) and auto-post the COGS journal
 * (FR-3.2). quantity may be in any defined UOM; converted to base (FR-3.4).
 */
export class FulfillStockDto {
  @IsUUID()
  product_id!: string;

  @IsUUID()
  warehouse_id!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity!: number;

  @IsOptional()
  @IsString()
  uom?: string; // defaults to product base_uom

  @IsOptional()
  @IsISO8601()
  entry_date?: string; // COGS journal date; defaults to today

  @IsOptional()
  @IsUUID()
  idempotency_key?: string; // §6.2, applied to the COGS journal
}

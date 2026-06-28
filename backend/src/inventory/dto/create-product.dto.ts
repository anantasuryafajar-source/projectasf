import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export const VALUATION_METHODS = ['moving_average', 'fifo'] as const;
export type ValuationMethod = (typeof VALUATION_METHODS)[number];

/** One nested-unit mapping to the product base unit (FR-3.4). */
export class UomConversionDto {
  @IsString()
  uom_name!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity_in_base!: number;
}

export class CreateProductDto {
  @IsString()
  sku!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsString()
  base_uom!: string; // lowest unit, e.g. 'bottle' (FR-3.4)

  @IsIn(VALUATION_METHODS)
  valuation_method!: ValuationMethod; // FR-3.1 (locked per category)

  @IsOptional()
  @IsBoolean()
  taxable?: boolean; // FR-4.1

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UomConversionDto)
  uom_conversions?: UomConversionDto[];
}

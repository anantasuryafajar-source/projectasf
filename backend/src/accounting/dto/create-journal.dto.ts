import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

// Mirrors the journal_source enum (migration 0001 / PRD FR-2.x, §7).
export const JOURNAL_SOURCES = [
  'manual',
  'sales_order.shipped',
  'payment.received',
  'sales_return.approved',
] as const;
export type JournalSource = (typeof JOURNAL_SOURCES)[number];

/**
 * A single double-entry line. Amounts are in the journal currency; the
 * service derives the IDR base amounts from exchange_rate (FR-1.3).
 * Exactly one of debit/credit must be > 0 (validated in JournalService).
 */
export class CreateJournalLineDto {
  @IsUUID()
  account_id!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  debit?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  credit?: number;

  @IsOptional()
  @IsString()
  memo?: string;
}

export class CreateJournalDto {
  // Optional: auto-generated (JV/<date>/<suffix>) when omitted.
  @IsOptional()
  @IsString()
  journal_reference?: string;

  @IsISO8601()
  entry_date!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(JOURNAL_SOURCES)
  source?: JournalSource;

  @IsOptional()
  @IsString()
  currency?: string; // defaults to IDR (FR-1.3)

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  exchange_rate?: number; // -> IDR translation (FR-1.3)

  @IsOptional()
  @IsUUID()
  idempotency_key?: string; // §6.2 retry-safe dedupe

  @IsOptional()
  @IsUUID()
  created_by?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => CreateJournalLineDto)
  items!: CreateJournalLineDto[];
}

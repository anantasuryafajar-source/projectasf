import { Type } from 'class-transformer';
import {
  IsArray,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class PaymentAllocationDto {
  @IsString()
  invoice_number!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;
}

/**
 * Cash receipt (§3.2 payment.received). When `allocations` is omitted the
 * payment is auto-applied to the customer's oldest outstanding invoices.
 * `customer_id` carries the business code (e.g. CUST-BRW-099).
 */
export class CreatePaymentDto {
  @IsOptional()
  @IsUUID()
  idempotency_key?: string;

  @IsString()
  payment_number!: string;

  @IsISO8601()
  payment_date!: string;

  @IsString()
  customer_id!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  exchange_rate?: number;

  // Bank/Cash account code to debit; defaults to PAYMENT_ACCOUNT_CODE.
  @IsOptional()
  @IsString()
  account_code?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations?: PaymentAllocationDto[];
}

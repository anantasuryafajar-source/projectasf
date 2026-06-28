import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateSalesReturnPayload } from '../database.types';
import { AuditActor } from '../auth/auth-user.interface';
import { CreateSalesReturnDto } from './dto/create-sales-return.dto';
import { computeInvoiceTotals } from './sales.calculator';

export interface SalesReturnResponse {
  status: string;
  return_id: string;
  credit_note_reference: string;
  total_amount: number;
  cogs_reversed: number;
}

@Injectable()
export class SalesReturnService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  /** Process an approved sales return (§3.2 sales_return.approved). */
  async create(
    dto: CreateSalesReturnDto,
    actor?: AuditActor,
  ): Promise<SalesReturnResponse> {
    const vatRate = Number(this.config.get<string>('VAT_RATE') ?? '0.11');
    const totals = computeInvoiceTotals(
      dto.items.map((i) => ({
        quantity: i.quantity,
        unit_price: i.unit_price,
        taxable: i.taxable,
        conversion_to_base: i.conversion_to_base,
      })),
      dto.discount_total ?? 0,
      vatRate,
    );

    const payload: CreateSalesReturnPayload = {
      idempotency_key: dto.idempotency_key ?? null,
      return_number: dto.return_number,
      return_date: dto.return_date,
      original_invoice_number: dto.original_invoice_number,
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      vat_amount: totals.vat_amount,
      total_amount: totals.total_amount,
      accounts: {
        ar: this.config.get<string>('AR_ACCOUNT_CODE') ?? '1100',
        revenue:
          this.config.get<string>('SALES_REVENUE_ACCOUNT_CODE') ?? '4100',
        vat_out: this.config.get<string>('VAT_OUT_ACCOUNT_CODE') ?? '2100',
        cogs: this.config.get<string>('COGS_ACCOUNT_CODE') ?? '5000',
        inventory:
          this.config.get<string>('INVENTORY_ASSET_ACCOUNT_CODE') ?? '1300',
      },
      items: dto.items.map((item, idx) => ({
        sku: item.sku,
        quantity: item.quantity,
        uom: item.uom,
        conversion_to_base: item.conversion_to_base,
        base_quantity: totals.lines[idx].base_quantity,
        unit_price: item.unit_price,
        unit_cost: item.unit_cost ?? 0,
        taxable: item.taxable,
        batch_number: item.batch_number,
        expiry_date: item.expiry_date,
        line_subtotal: totals.lines[idx].line_subtotal,
        line_vat: totals.lines[idx].line_vat,
      })),
    };

    const { data, error } = await this.supabase.client.rpc(
      'audited_create_sales_return',
      { p: payload, _actor: actor?.id, _ip: actor?.ip },
    );
    if (error) this.mapRpcError(error.message);

    const result = data;
    return {
      status: result.status,
      return_id: result.return_id,
      credit_note_reference: result.credit_note_reference,
      total_amount: Number(result.total_amount),
      cogs_reversed: Number(result.cogs_reversed ?? 0),
    };
  }

  private mapRpcError(message: string): never {
    if (message.includes('_NOT_FOUND')) throw new NotFoundException(message);
    if (message.includes('RETURN_EXCEEDS_INVOICE'))
      throw new ConflictException(message);
    throw new BadRequestException(message);
  }
}

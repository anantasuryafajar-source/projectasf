import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateSalesInvoicePayload } from '../database.types';
import { AuditActor } from '../auth/auth-user.interface';
import { CreateSalesInvoiceDto } from './dto/create-sales-invoice.dto';
import { computeInvoiceTotals } from './sales.calculator';

// §7.2 response shape.
export interface SalesInvoiceResponse {
  status: string;
  invoice_id: string;
  journal_reference: string;
  total_amount: number;
  vat_amount: number;
  posted_at: string;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Process a sales invoice (§7). Totals/VAT are computed here; the atomic
   * create_sales_invoice RPC enforces idempotency (§6.2), credit limit
   * (FR-2.4), FIFO depletion (FR-3.5) and journal posting (§3.2, FR-3.2).
   */
  async create(
    dto: CreateSalesInvoiceDto,
    actor?: AuditActor,
  ): Promise<SalesInvoiceResponse> {
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

    const payload: CreateSalesInvoicePayload = {
      idempotency_key: dto.idempotency_key ?? null,
      invoice_number: dto.invoice_number,
      transaction_date: dto.transaction_date,
      customer_code: dto.customer_id,
      warehouse_code: dto.warehouse_id,
      term_of_payment_days: dto.term_of_payment_days ?? 0,
      currency: dto.currency ?? 'IDR',
      exchange_rate: dto.exchange_rate ?? 1,
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
        taxable: item.taxable,
        batch_number: item.batch_number ?? null,
        expiry_date: item.expiry_date ?? null,
        line_subtotal: totals.lines[idx].line_subtotal,
        line_vat: totals.lines[idx].line_vat,
      })),
    };

    const { data, error } = await this.supabase.client.rpc(
      'audited_create_sales_invoice',
      { p: payload, _actor: actor?.id, _ip: actor?.ip },
    );
    if (error) this.mapRpcError(error.message);

    const result = data;
    return {
      status: result.status,
      invoice_id: result.invoice_id,
      journal_reference: result.journal_reference,
      total_amount: Number(result.total_amount),
      vat_amount: Number(result.vat_amount),
      posted_at: result.posted_at,
    };
  }

  /** Translate tagged DB exceptions into HTTP errors. */
  private mapRpcError(message: string): never {
    if (
      message.includes('CREDIT_LIMIT_EXCEEDED') ||
      message.includes('OVERDUE_INVOICES')
    ) {
      throw new ConflictException(message); // 409 — policy violation (FR-2.4)
    }
    if (message.includes('_NOT_FOUND')) {
      throw new NotFoundException(message); // 404
    }
    throw new BadRequestException(message); // 400 (incl. balance, insufficient stock)
  }
}

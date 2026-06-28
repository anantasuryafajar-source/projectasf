import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateSalesInvoicePayload } from '../database.types';
import { SalesService } from './sales.service';
import { CreateSalesInvoiceDto } from './dto/create-sales-invoice.dto';

// Minimal §7.1 payload used across tests.
function sampleDto(
  overrides: Partial<CreateSalesInvoiceDto> = {},
): CreateSalesInvoiceDto {
  return {
    idempotency_key: 'c39a8c6a-be3d-4c31-9f93-cb7e1897c83f',
    invoice_number: 'INV/20260628/0001',
    transaction_date: '2026-06-28',
    customer_id: 'CUST-BRW-099',
    term_of_payment_days: 14,
    currency: 'IDR',
    exchange_rate: 1.0,
    items: [
      {
        sku: 'BRW-WLNS-01',
        quantity: 10,
        uom: 'carton',
        conversion_to_base: 24,
        unit_price: 250000,
        taxable: true,
        batch_number: 'BATCH-2026-A2',
        expiry_date: '2027-06-28',
      },
    ],
    discount_total: 0,
    warehouse_id: 'WH-KEBAGUSAN-01',
    ...overrides,
  };
}

describe('SalesService.create (§7)', () => {
  let rpc: jest.Mock;
  let service: SalesService;

  beforeEach(() => {
    rpc = jest.fn();
    const supabase = { client: { rpc } } as unknown as SupabaseService;
    const config = {
      get: (key: string) => {
        const map: Record<string, string> = {
          VAT_RATE: '0.11',
          AR_ACCOUNT_CODE: '1100',
          SALES_REVENUE_ACCOUNT_CODE: '4100',
          VAT_OUT_ACCOUNT_CODE: '2100',
          COGS_ACCOUNT_CODE: '5000',
          INVENTORY_ASSET_ACCOUNT_CODE: '1300',
        };
        return map[key];
      },
    } as unknown as ConfigService;
    service = new SalesService(supabase, config);
  });

  it('sends correctly computed totals to the RPC and maps the §7.2 response', async () => {
    rpc.mockResolvedValue({
      data: {
        status: 'success',
        invoice_id: 'TXN-AR-99201',
        journal_reference: 'JV/AR/INV/20260628/0001',
        total_amount: 2775000,
        vat_amount: 275000,
        posted_at: '2026-06-28T14:28:41Z',
        idempotent_replay: false,
      },
      error: null,
    });

    const res = await service.create(sampleDto());

    // Response mapping (§7.2)
    expect(res).toEqual({
      status: 'success',
      invoice_id: 'TXN-AR-99201',
      journal_reference: 'JV/AR/INV/20260628/0001',
      total_amount: 2775000,
      vat_amount: 275000,
      posted_at: '2026-06-28T14:28:41Z',
    });

    // Payload computed by the service before hitting the DB
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fnName, args] = rpc.mock.calls[0] as [
      string,
      { p: CreateSalesInvoicePayload },
    ];
    expect(fnName).toBe('audited_create_sales_invoice');
    expect(args.p.subtotal).toBe(2500000);
    expect(args.p.vat_amount).toBe(275000);
    expect(args.p.total_amount).toBe(2775000);
    expect(args.p.customer_code).toBe('CUST-BRW-099');
    expect(args.p.warehouse_code).toBe('WH-KEBAGUSAN-01');
    expect(args.p.items[0].base_quantity).toBe(240);
    expect(args.p.idempotency_key).toBe('c39a8c6a-be3d-4c31-9f93-cb7e1897c83f');
  });

  it('returns success on idempotent replay', async () => {
    rpc.mockResolvedValue({
      data: {
        status: 'success',
        invoice_id: 'TXN-AR-99201',
        journal_reference: 'JV/AR/INV/20260628/0001',
        total_amount: 2775000,
        vat_amount: 275000,
        posted_at: '2026-06-28T14:28:41Z',
        idempotent_replay: true,
      },
      error: null,
    });

    const res = await service.create(sampleDto());
    expect(res.status).toBe('success');
    expect(res.invoice_id).toBe('TXN-AR-99201');
  });

  it('maps CREDIT_LIMIT_EXCEEDED to 409 Conflict (FR-2.4)', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        message:
          'CREDIT_LIMIT_EXCEEDED: customer CUST-BRW-099 outstanding 9000000 + new 2775000 exceeds limit 10000000 (FR-2.4)',
      },
    });

    await expect(service.create(sampleDto())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('maps OVERDUE_INVOICES to 409 Conflict (FR-2.4)', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'OVERDUE_INVOICES: customer CUST-BRW-099 has 2 ...' },
    });

    await expect(service.create(sampleDto())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('maps *_NOT_FOUND to 404 Not Found', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'CUSTOMER_NOT_FOUND: CUST-XXX' },
    });

    await expect(service.create(sampleDto())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('maps other DB errors (e.g. insufficient stock) to 400', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'Insufficient stock for product ...' },
    });

    await expect(service.create(sampleDto())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { RecordPaymentPayload } from '../database.types';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

function sampleDto(
  overrides: Partial<CreatePaymentDto> = {},
): CreatePaymentDto {
  return {
    idempotency_key: 'a1b2c3d4-0000-4000-8000-000000000001',
    payment_number: 'PAY/20260701/0001',
    payment_date: '2026-07-01',
    customer_id: 'CUST-BRW-099',
    amount: 2775000,
    currency: 'IDR',
    exchange_rate: 1,
    ...overrides,
  };
}

describe('PaymentsService.create (§3.2 payment.received)', () => {
  let rpc: jest.Mock;
  let service: PaymentsService;

  beforeEach(() => {
    rpc = jest.fn();
    const supabase = { client: { rpc } } as unknown as SupabaseService;
    const config = {
      get: (key: string) =>
        ({ PAYMENT_ACCOUNT_CODE: '1000', AR_ACCOUNT_CODE: '1100' })[key],
    } as unknown as ConfigService;
    service = new PaymentsService(supabase, config);
  });

  it('builds the payload and maps the response', async () => {
    rpc.mockResolvedValue({
      data: {
        status: 'success',
        payment_id: 'PAY-1',
        journal_reference: 'JV/RCPT/PAY/20260701/0001',
        amount: 2775000,
        allocated: 2775000,
        unapplied: 0,
        posted_at: '2026-07-01T09:00:00Z',
        idempotent_replay: false,
        invoices: [
          {
            invoice_number: 'INV/20260628/0001',
            applied: 2775000,
            status: 'paid',
          },
        ],
      },
      error: null,
    });

    const res = await service.create(sampleDto());

    expect(res.payment_id).toBe('PAY-1');
    expect(res.allocated).toBe(2775000);
    expect(res.invoices[0].status).toBe('paid');

    const [fn, args] = rpc.mock.calls[0] as [
      string,
      { p: RecordPaymentPayload },
    ];
    expect(fn).toBe('audited_record_payment');
    expect(args.p.account_code).toBe('1000'); // default Bank/Cash
    expect(args.p.ar_account_code).toBe('1100');
    expect(args.p.customer_code).toBe('CUST-BRW-099');
    expect(args.p.allocations).toEqual([]); // omitted -> auto-allocate
  });

  it('forwards explicit allocations', async () => {
    rpc.mockResolvedValue({
      data: {
        status: 'success',
        payment_id: 'PAY-2',
        journal_reference: 'JV/RCPT/x',
        amount: 100,
        allocated: 100,
        unapplied: 0,
        posted_at: '2026-07-01T09:00:00Z',
        idempotent_replay: false,
        invoices: [],
      },
      error: null,
    });

    await service.create(
      sampleDto({
        amount: 100,
        allocations: [{ invoice_number: 'INV/X', amount: 100 }],
      }),
    );

    const [, args] = rpc.mock.calls[0] as [string, { p: RecordPaymentPayload }];
    expect(args.p.allocations).toEqual([
      { invoice_number: 'INV/X', amount: 100 },
    ]);
  });

  it('maps *_NOT_FOUND to 404', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'INVOICE_NOT_FOUND: INV/X' },
    });
    await expect(service.create(sampleDto())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('maps NO_OUTSTANDING_INVOICE to 400', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'NO_OUTSTANDING_INVOICE: nothing to allocate ...' },
    });
    await expect(service.create(sampleDto())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

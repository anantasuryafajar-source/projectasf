import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { RecordPaymentPayload } from '../database.types';
import { AuditActor } from '../auth/auth-user.interface';
import { CreatePaymentDto } from './dto/create-payment.dto';

export interface PaymentResponse {
  status: string;
  payment_id: string;
  journal_reference: string;
  amount: number;
  allocated: number;
  unapplied: number;
  posted_at: string;
  invoices: Array<{ invoice_number: string; applied: number; status: string }>;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Record a customer payment (§3.2 payment.received) via the atomic
   * record_payment RPC: allocate to invoices, post Debit Bank/Cash /
   * Credit AR, close the AR. Idempotent on idempotency_key (§6.2).
   */
  async create(
    dto: CreatePaymentDto,
    actor?: AuditActor,
  ): Promise<PaymentResponse> {
    const payload: RecordPaymentPayload = {
      idempotency_key: dto.idempotency_key ?? null,
      payment_number: dto.payment_number,
      payment_date: dto.payment_date,
      customer_code: dto.customer_id,
      amount: dto.amount,
      currency: dto.currency ?? 'IDR',
      exchange_rate: dto.exchange_rate ?? 1,
      account_code:
        dto.account_code ??
        this.config.get<string>('PAYMENT_ACCOUNT_CODE') ??
        '1000',
      ar_account_code: this.config.get<string>('AR_ACCOUNT_CODE') ?? '1100',
      allocations: (dto.allocations ?? []).map((a) => ({
        invoice_number: a.invoice_number,
        amount: a.amount,
      })),
    };

    const { data, error } = await this.supabase.client.rpc(
      'audited_record_payment',
      { p: payload, _actor: actor?.id, _ip: actor?.ip },
    );
    if (error) this.mapRpcError(error.message);

    const result = data;
    return {
      status: result.status,
      payment_id: result.payment_id,
      journal_reference: result.journal_reference,
      amount: Number(result.amount),
      allocated: Number(result.allocated),
      unapplied: Number(result.unapplied ?? 0),
      posted_at: result.posted_at,
      invoices: result.invoices ?? [],
    };
  }

  private mapRpcError(message: string): never {
    if (message.includes('_NOT_FOUND')) {
      throw new NotFoundException(message); // 404
    }
    // NO_OUTSTANDING / INVOICE_VOID / MISMATCH / INVALID_AMOUNT / mapping
    throw new BadRequestException(message); // 400
  }
}

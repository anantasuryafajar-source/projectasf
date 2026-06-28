import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { JournalLinePayload, JournalPostPayload } from '../database.types';
import { CreateJournalDto } from './dto/create-journal.dto';

/** Round to 2 decimals (currency precision) avoiding float drift. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

@Injectable()
export class JournalService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Post a balanced double-entry journal atomically via the
   * post_journal_entry RPC (migration 0002). Balance (FR-1.2) is checked
   * here for a fast 400, and again by the DB deferred trigger as a backstop.
   * Idempotent on idempotency_key (§6.2).
   */
  async post(dto: CreateJournalDto) {
    const rate = dto.exchange_rate ?? 1;

    const lines: JournalLinePayload[] = dto.items.map((item, idx) => {
      const debit = item.debit ?? 0;
      const credit = item.credit ?? 0;
      if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
        throw new BadRequestException(
          `Line ${idx + 1} must have exactly one of debit or credit > 0 (FR-1.2).`,
        );
      }
      return {
        account_id: item.account_id,
        line_number: idx + 1,
        memo: item.memo,
        debit,
        credit,
        base_debit: round2(debit * rate),
        base_credit: round2(credit * rate),
      };
    });

    const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
    const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
    if (totalDebit !== totalCredit) {
      throw new BadRequestException(
        `Unbalanced journal: debit ${totalDebit} != credit ${totalCredit} (FR-1.2).`,
      );
    }

    const payload: JournalPostPayload = {
      journal_reference:
        dto.journal_reference ?? this.generateReference(dto.entry_date),
      entry_date: dto.entry_date,
      description: dto.description ?? null,
      source: dto.source ?? 'manual',
      currency: dto.currency ?? 'IDR',
      exchange_rate: rate,
      idempotency_key: dto.idempotency_key ?? null,
      created_by: dto.created_by ?? null,
      items: lines,
    };

    const { data, error } = await this.supabase.client.rpc(
      'post_journal_entry',
      { p_payload: payload },
    );
    // Balance / constraint violations surface here -> treat as client error.
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async findById(id: string) {
    const { data: entry, error } = await this.supabase.client
      .from('journal_entries')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!entry) throw new NotFoundException(`Journal entry ${id} not found`);

    const { data: items, error: itemsErr } = await this.supabase.client
      .from('journal_items')
      .select('*')
      .eq('journal_entry_id', id)
      .order('line_number');
    if (itemsErr) throw new InternalServerErrorException(itemsErr.message);

    return { ...entry, journal_items: items ?? [] };
  }

  async list(limit = 50) {
    const { data, error } = await this.supabase.client
      .from('journal_entries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  private generateReference(entryDate: string): string {
    const compact = entryDate.replace(/-/g, '');
    const suffix = randomUUID().split('-')[0].toUpperCase();
    return `JV/${compact}/${suffix}`;
  }
}

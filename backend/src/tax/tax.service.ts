import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AssignNsfpResult } from '../database.types';

function csvCell(value: string | number | null): string {
  const s = value === null ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

@Injectable()
export class TaxService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Register a pool of acquired NSFP serial numbers (FR-4.3). */
  async addNsfp(serials: string[]) {
    const rows = serials.map((serial_number) => ({ serial_number }));
    const { data, error } = await this.supabase.client
      .from('nsfp_numbers')
      .insert(rows)
      .select();
    if (error) throw new InternalServerErrorException(error.message);
    return { added: data?.length ?? 0 };
  }

  async listNsfp() {
    const { data, error } = await this.supabase.client
      .from('nsfp_numbers')
      .select('*')
      .order('serial_number');
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  /** Auto-assign available NSFP to taxable invoices chronologically (FR-4.3). */
  async assignPending(): Promise<AssignNsfpResult> {
    const { data, error } = await this.supabase.client.rpc(
      'assign_pending_nsfp',
      {},
    );
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  /**
   * Build a DJP e-Faktur style CSV for taxable invoices in a date range
   * (FR-4.2). NOTE: column layout follows the e-Faktur structure but the
   * exact official header order / NPWP fields must be confirmed against the
   * current DJP import template before production use.
   */
  async efakturCsv(from: string, to: string): Promise<string> {
    const { data: invoices, error } = await this.supabase.client
      .from('sales_invoices')
      .select('*')
      .gt('vat_amount', 0)
      .neq('status', 'void')
      .gte('transaction_date', from)
      .lte('transaction_date', to)
      .order('transaction_date');
    if (error) throw new InternalServerErrorException(error.message);

    const list = invoices ?? [];
    const customerIds = [...new Set(list.map((i) => i.customer_id))];
    const customerMap = new Map<
      string,
      { code: string; name: string; npwp: string | null }
    >();
    if (customerIds.length) {
      const { data: customers, error: cErr } = await this.supabase.client
        .from('customers')
        .select('id, code, name, npwp')
        .in('id', customerIds);
      if (cErr) throw new InternalServerErrorException(cErr.message);
      for (const c of customers ?? [])
        customerMap.set(c.id, { code: c.code, name: c.name, npwp: c.npwp });
    }

    const header = [
      'tax_invoice_number',
      'invoice_number',
      'transaction_date',
      'customer_code',
      'customer_name',
      'npwp',
      'dpp',
      'ppn',
      'total',
    ];
    const lines = [header.map(csvCell).join(',')];
    for (const inv of list) {
      const cust = customerMap.get(inv.customer_id);
      lines.push(
        [
          csvCell(inv.tax_invoice_number),
          csvCell(inv.invoice_number),
          csvCell(inv.transaction_date),
          csvCell(cust?.code ?? ''),
          csvCell(cust?.name ?? ''),
          csvCell(cust?.npwp ?? ''),
          csvCell(Number(inv.subtotal) - Number(inv.discount_total)),
          csvCell(Number(inv.vat_amount)),
          csvCell(Number(inv.total_amount)),
        ].join(','),
      );
    }
    return lines.join('\n');
  }
}

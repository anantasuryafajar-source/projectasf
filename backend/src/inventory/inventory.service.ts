import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { AccountsService } from '../accounting/accounts.service';
import { JournalService } from '../accounting/journal.service';
import { UomService } from './uom.service';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { FulfillStockDto } from './dto/fulfill-stock.dto';
import { FifoResult } from '../database.types';

@Injectable()
export class InventoryService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly uom: UomService,
    private readonly accounts: AccountsService,
    private readonly journals: JournalService,
    private readonly config: ConfigService,
  ) {}

  /** Receive stock into a batch (FR-3.5); quantity stored in base unit (FR-3.4). */
  async receive(dto: ReceiveStockDto) {
    const qtyBase = await this.uom.toBase(
      dto.product_id,
      dto.quantity,
      dto.uom,
    );

    const { data: existing, error: findErr } = await this.supabase.client
      .from('inventory_batches')
      .select('id, quantity_on_hand')
      .eq('product_id', dto.product_id)
      .eq('warehouse_id', dto.warehouse_id)
      .eq('batch_number', dto.batch_number)
      .maybeSingle();
    if (findErr) throw new InternalServerErrorException(findErr.message);

    if (existing) {
      const { data, error } = await this.supabase.client
        .from('inventory_batches')
        .update({
          quantity_on_hand: Number(existing.quantity_on_hand) + qtyBase,
          unit_cost: dto.unit_cost,
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw new InternalServerErrorException(error.message);
      return data;
    }

    const { data, error } = await this.supabase.client
      .from('inventory_batches')
      .insert({
        product_id: dto.product_id,
        warehouse_id: dto.warehouse_id,
        batch_number: dto.batch_number,
        expiry_date: dto.expiry_date,
        quantity_on_hand: qtyBase,
        unit_cost: dto.unit_cost,
      })
      .select()
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  /**
   * Deplete stock FIFO by expiry (FR-3.5) via the fulfill_inventory_fifo RPC,
   * then auto-generate the COGS journal (FR-3.2):
   *   Debit COGS / Credit Inventory Asset.
   */
  async fulfill(dto: FulfillStockDto) {
    const qtyBase = await this.uom.toBase(
      dto.product_id,
      dto.quantity,
      dto.uom,
    );

    const { data, error } = await this.supabase.client.rpc(
      'fulfill_inventory_fifo',
      {
        p_product_id: dto.product_id,
        p_warehouse_id: dto.warehouse_id,
        p_qty_base: qtyBase,
      },
    );
    if (error) throw new BadRequestException(error.message);

    const fifo: FifoResult = data;
    const totalCost = Number(fifo.total_cost);

    let cogsJournal: Awaited<ReturnType<JournalService['post']>> | null = null;
    if (totalCost > 0) {
      cogsJournal = await this.postCogsJournal(totalCost, dto);
    }

    return { fulfillment: fifo, cogs_journal: cogsJournal };
  }

  /** COGS auto-journal (FR-3.2). Account codes are resolved from config. */
  private async postCogsJournal(amount: number, dto: FulfillStockDto) {
    const cogsCode = this.config.get<string>('COGS_ACCOUNT_CODE');
    const inventoryCode = this.config.get<string>(
      'INVENTORY_ASSET_ACCOUNT_CODE',
    );
    if (!cogsCode || !inventoryCode) {
      throw new InternalServerErrorException(
        'COGS_ACCOUNT_CODE / INVENTORY_ASSET_ACCOUNT_CODE are not configured; ' +
          'cannot post the COGS journal (FR-3.2).',
      );
    }

    const cogs = await this.accounts.getByCode(cogsCode);
    const inventory = await this.accounts.getByCode(inventoryCode);

    return this.journals.post({
      entry_date: dto.entry_date ?? new Date().toISOString().slice(0, 10),
      description: `COGS for fulfillment of product ${dto.product_id}`,
      source: 'sales_order.shipped',
      currency: 'IDR',
      exchange_rate: 1,
      idempotency_key: dto.idempotency_key,
      items: [
        { account_id: cogs.id, debit: amount }, // Debit COGS
        { account_id: inventory.id, credit: amount }, // Credit Inventory Asset
      ],
    });
  }

  /** Current on-hand batches for a product (optionally a single warehouse). */
  async getStock(productId: string, warehouseId?: string) {
    let query = this.supabase.client
      .from('inventory_batches')
      .select('*')
      .eq('product_id', productId)
      .gt('quantity_on_hand', 0)
      .order('expiry_date', { ascending: true });
    if (warehouseId) query = query.eq('warehouse_id', warehouseId);

    const { data, error } = await query;
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }
}

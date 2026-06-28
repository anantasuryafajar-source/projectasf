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
import { TransferStockDto } from './dto/transfer-stock.dto';
import { FifoResult } from '../database.types';
import { AuditActor } from '../auth/auth-user.interface';

@Injectable()
export class InventoryService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly uom: UomService,
    private readonly accounts: AccountsService,
    private readonly journals: JournalService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Receive stock into a batch (FR-3.5); quantity stored in base unit (FR-3.4).
   * Atomic upsert via the audited RPC so the audit row carries actor/IP (§6.2).
   */
  async receive(dto: ReceiveStockDto, actor?: AuditActor) {
    const qtyBase = await this.uom.toBase(
      dto.product_id,
      dto.quantity,
      dto.uom,
    );

    const { data, error } = await this.supabase.client.rpc(
      'audited_receive_stock',
      {
        p: {
          product_id: dto.product_id,
          warehouse_id: dto.warehouse_id,
          batch_number: dto.batch_number,
          expiry_date: dto.expiry_date,
          base_quantity: qtyBase,
          unit_cost: dto.unit_cost,
        },
        _actor: actor?.id,
        _ip: actor?.ip,
      },
    );
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  /** Transfer stock between warehouses (FR-3.3, no P&L). */
  async transfer(dto: TransferStockDto, actor?: AuditActor) {
    const { data, error } = await this.supabase.client.rpc(
      'audited_transfer_stock',
      {
        p: {
          idempotency_key: dto.idempotency_key ?? null,
          transfer_number: dto.transfer_number,
          transfer_date: dto.transfer_date,
          from_warehouse_code: dto.from_warehouse_code,
          to_warehouse_code: dto.to_warehouse_code,
          items: dto.items.map((i) => ({
            sku: i.sku,
            quantity: i.quantity,
            uom: i.uom,
            conversion_to_base: i.conversion_to_base,
            base_quantity: i.quantity * i.conversion_to_base,
            batch_number: i.batch_number,
            expiry_date: i.expiry_date,
          })),
        },
        _actor: actor?.id,
        _ip: actor?.ip,
      },
    );
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  /**
   * Deplete stock FIFO by expiry (FR-3.5) via the fulfill_inventory_fifo RPC,
   * then auto-generate the COGS journal (FR-3.2):
   *   Debit COGS / Credit Inventory Asset.
   */
  async fulfill(dto: FulfillStockDto, actor?: AuditActor) {
    const qtyBase = await this.uom.toBase(
      dto.product_id,
      dto.quantity,
      dto.uom,
    );

    const { data, error } = await this.supabase.client.rpc(
      'audited_fulfill_inventory_fifo',
      {
        p_product_id: dto.product_id,
        p_warehouse_id: dto.warehouse_id,
        p_qty_base: qtyBase,
        _actor: actor?.id,
        _ip: actor?.ip,
      },
    );
    if (error) throw new BadRequestException(error.message);

    const fifo: FifoResult = data;
    const totalCost = Number(fifo.total_cost);

    let cogsJournal: Awaited<ReturnType<JournalService['post']>> | null = null;
    if (totalCost > 0) {
      cogsJournal = await this.postCogsJournal(totalCost, dto, actor);
    }

    return { fulfillment: fifo, cogs_journal: cogsJournal };
  }

  /** COGS auto-journal (FR-3.2). Account codes are resolved from config. */
  private async postCogsJournal(
    amount: number,
    dto: FulfillStockDto,
    actor?: AuditActor,
  ) {
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

    return this.journals.post(
      {
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
      },
      actor,
    );
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

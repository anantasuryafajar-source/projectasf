// Typed schema for the Supabase client. Mirrors supabase/migrations/0001 & 0002.
// Hand-authored equivalent of `supabase gen types typescript`; keep in sync
// with the migrations. Typing the client removes `any` at the data boundary.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// --- Enums (migration 0001) ---
export type UserRole = 'owner' | 'admin_gudang' | 'sales_kasir';
export type AccountType =
  'asset' | 'liability' | 'equity' | 'revenue' | 'cogs' | 'expense';
export type NormalBalance = 'debit' | 'credit';
export type ValuationMethodEnum = 'moving_average' | 'fifo';
export type JournalStatus = 'draft' | 'posted' | 'voided';
export type JournalSourceEnum =
  | 'manual'
  | 'sales_order.shipped'
  | 'payment.received'
  | 'sales_return.approved';

// --- RPC payload / result shapes (migration 0002) ---
export interface JournalLinePayload {
  account_id: string;
  line_number: number;
  memo?: string;
  debit: number;
  credit: number;
  base_debit: number;
  base_credit: number;
}

export interface JournalPostPayload {
  journal_reference: string;
  entry_date: string;
  description: string | null;
  source: string;
  currency: string;
  exchange_rate: number;
  idempotency_key: string | null;
  created_by: string | null;
  items: JournalLinePayload[];
}

export interface FifoBatchLine {
  batch_id: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  unit_cost: number;
}

export interface FifoResult {
  total_cost: number;
  quantity: number;
  method?: string;
  avg_cost?: number;
  batches: FifoBatchLine[];
}

// --- Sales invoice RPC shapes (migration 0003 / PRD §7) ---
export type SalesInvoiceStatus = 'issued' | 'paid' | 'void';
export type NsfpStatus = 'available' | 'assigned' | 'void';

export interface AssignNsfpResult {
  assigned: number;
  remaining_available: number;
  assignments: Array<{ invoice_number: string; serial_number: string }>;
}

export interface SalesInvoicePayloadItem {
  sku: string;
  quantity: number;
  uom: string;
  conversion_to_base: number;
  base_quantity: number;
  unit_price: number;
  taxable: boolean;
  batch_number: string | null;
  expiry_date: string | null;
  line_subtotal: number;
  line_vat: number;
}

export interface CreateSalesInvoicePayload {
  idempotency_key: string | null;
  invoice_number: string;
  transaction_date: string;
  customer_code: string;
  warehouse_code: string;
  term_of_payment_days: number;
  currency: string;
  exchange_rate: number;
  subtotal: number;
  discount_total: number;
  vat_amount: number;
  total_amount: number;
  accounts: {
    ar: string;
    revenue: string;
    vat_out: string;
    cogs: string;
    inventory: string;
  };
  items: SalesInvoicePayloadItem[];
}

export interface SalesInvoiceRpcResult {
  status: string;
  invoice_id: string;
  journal_reference: string;
  total_amount: number;
  vat_amount: number;
  posted_at: string;
  idempotent_replay: boolean;
}

// --- Payment RPC shapes (migration 0005 / PRD §3.2 payment.received) ---
export interface PaymentAllocationInput {
  invoice_number: string;
  amount: number;
}

export interface RecordPaymentPayload {
  idempotency_key: string | null;
  payment_number: string;
  payment_date: string;
  customer_code: string;
  amount: number;
  currency: string;
  exchange_rate: number;
  account_code: string; // Bank/Cash account (debit)
  ar_account_code: string;
  allocations: PaymentAllocationInput[];
}

export interface RecordPaymentResult {
  status: string;
  payment_id: string;
  journal_reference: string;
  amount: number;
  allocated: number;
  unapplied?: number;
  posted_at: string;
  idempotent_replay: boolean;
  invoices: Array<{
    invoice_number: string;
    applied: number;
    status: string;
  }>;
}

// --- Sales return RPC shapes (migration 0007 / PRD §3.2) ---
export interface SalesReturnPayloadItem {
  sku: string;
  quantity: number;
  uom: string;
  conversion_to_base: number;
  base_quantity: number;
  unit_price: number;
  unit_cost: number;
  taxable: boolean;
  batch_number: string;
  expiry_date: string;
  line_subtotal: number;
  line_vat: number;
}
export interface CreateSalesReturnPayload {
  idempotency_key: string | null;
  return_number: string;
  return_date: string;
  original_invoice_number: string;
  subtotal: number;
  discount_total: number;
  vat_amount: number;
  total_amount: number;
  accounts: {
    ar: string;
    revenue: string;
    vat_out: string;
    cogs: string;
    inventory: string;
  };
  items: SalesReturnPayloadItem[];
}
export interface SalesReturnRpcResult {
  status: string;
  return_id: string;
  credit_note_reference: string;
  total_amount: number;
  cogs_reversed?: number;
  idempotent_replay: boolean;
}

// --- Stock transfer (0014), receive (0015), forex (0016) shapes ---
export interface TransferStockPayloadItem {
  sku: string;
  quantity: number;
  uom: string;
  conversion_to_base: number;
  base_quantity: number;
  batch_number: string;
  expiry_date: string;
}
export interface TransferStockPayload {
  idempotency_key: string | null;
  transfer_number: string;
  transfer_date: string;
  from_warehouse_code: string;
  to_warehouse_code: string;
  items: TransferStockPayloadItem[];
}
export interface TransferStockResult {
  status: string;
  transfer_id: string;
  items_moved?: number;
  idempotent_replay: boolean;
}

export interface ReceiveStockPayload {
  product_id: string;
  warehouse_id: string;
  batch_number: string;
  expiry_date: string;
  base_quantity: number;
  unit_cost: number;
}

export interface RevaluePayload {
  as_of: string;
  ar_account_code: string;
  gain_account_code: string;
  loss_account_code: string;
}
export interface RevalueResult {
  as_of: string;
  revalued_count: number;
  net_adjustment: number;
  journal_reference: string | null;
}

// --- Report RPC shapes (migration 0006 / PRD Obj 1.2) ---
export interface TrialBalanceLine {
  account_code: string;
  account_name: string;
  account_type: string;
  debit: number;
  credit: number;
}
export interface TrialBalanceResult {
  as_of: string;
  lines: TrialBalanceLine[];
  total_debit: number;
  total_credit: number;
  balanced: boolean;
}

export interface ProfitLossLine {
  account_type: string;
  account_code: string;
  account_name: string;
  amount: number;
}
export interface ProfitLossResult {
  period_from: string;
  period_to: string;
  revenue: number;
  cogs: number;
  gross_profit: number;
  expense: number;
  net_income: number;
  lines: ProfitLossLine[];
}

export interface BalanceSheetLine {
  account_code: string;
  account_name: string;
  amount: number;
}
export interface BalanceSheetResult {
  as_of: string;
  assets: BalanceSheetLine[];
  liabilities: BalanceSheetLine[];
  equity: BalanceSheetLine[];
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
  current_earnings: number;
  total_liabilities_equity: number;
  balanced: boolean;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          role: UserRole;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          role?: UserRole;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string;
          role?: UserRole;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      accounts: {
        Row: {
          id: string;
          account_code: string;
          account_name: string;
          account_type: AccountType;
          normal_balance: NormalBalance;
          parent_account_id: string | null;
          currency: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          account_code: string;
          account_name: string;
          account_type: AccountType;
          normal_balance: NormalBalance;
          parent_account_id?: string | null;
          currency?: string;
          is_active?: boolean;
        };
        Update: {
          account_code?: string;
          account_name?: string;
          account_type?: AccountType;
          normal_balance?: NormalBalance;
          parent_account_id?: string | null;
          currency?: string;
          is_active?: boolean;
        };
        Relationships: [];
      };
      warehouses: {
        Row: {
          id: string;
          code: string;
          name: string;
          is_virtual: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          is_virtual?: boolean;
          is_active?: boolean;
        };
        Update: {
          code?: string;
          name?: string;
          is_virtual?: boolean;
          is_active?: boolean;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          sku: string;
          name: string;
          category: string | null;
          base_uom: string;
          valuation_method: ValuationMethodEnum;
          taxable: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          sku: string;
          name: string;
          category?: string | null;
          base_uom: string;
          valuation_method: ValuationMethodEnum;
          taxable?: boolean;
          is_active?: boolean;
        };
        Update: {
          sku?: string;
          name?: string;
          category?: string | null;
          base_uom?: string;
          valuation_method?: ValuationMethodEnum;
          taxable?: boolean;
          is_active?: boolean;
        };
        Relationships: [];
      };
      product_uom_conversions: {
        Row: {
          id: string;
          product_id: string;
          uom_name: string;
          quantity_in_base: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          uom_name: string;
          quantity_in_base: number;
        };
        Update: {
          uom_name?: string;
          quantity_in_base?: number;
        };
        Relationships: [];
      };
      inventory_batches: {
        Row: {
          id: string;
          product_id: string;
          warehouse_id: string;
          batch_number: string;
          expiry_date: string;
          quantity_on_hand: number;
          unit_cost: number;
          received_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          warehouse_id: string;
          batch_number: string;
          expiry_date: string;
          quantity_on_hand?: number;
          unit_cost?: number;
          received_at?: string;
        };
        Update: {
          quantity_on_hand?: number;
          unit_cost?: number;
          expiry_date?: string;
        };
        Relationships: [];
      };
      journal_entries: {
        Row: {
          id: string;
          journal_reference: string;
          entry_date: string;
          description: string | null;
          source: JournalSourceEnum;
          currency: string;
          exchange_rate: number;
          status: JournalStatus;
          idempotency_key: string | null;
          reversal_of: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          posted_at: string | null;
        };
        Insert: {
          id?: string;
          journal_reference: string;
          entry_date: string;
          description?: string | null;
          source?: JournalSourceEnum;
          currency?: string;
          exchange_rate?: number;
          status?: JournalStatus;
          idempotency_key?: string | null;
          reversal_of?: string | null;
          created_by?: string | null;
          posted_at?: string | null;
        };
        Update: {
          status?: JournalStatus;
          description?: string | null;
          posted_at?: string | null;
        };
        Relationships: [];
      };
      journal_items: {
        Row: {
          id: string;
          journal_entry_id: string;
          account_id: string;
          line_number: number;
          memo: string | null;
          debit: number;
          credit: number;
          base_debit: number;
          base_credit: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          journal_entry_id: string;
          account_id: string;
          line_number: number;
          memo?: string | null;
          debit?: number;
          credit?: number;
          base_debit?: number;
          base_credit?: number;
        };
        Update: {
          memo?: string | null;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          code: string;
          name: string;
          npwp: string | null;
          address: string | null;
          credit_limit: number;
          term_of_payment_days: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          npwp?: string | null;
          address?: string | null;
          credit_limit?: number;
          term_of_payment_days?: number;
          is_active?: boolean;
        };
        Update: {
          code?: string;
          name?: string;
          npwp?: string | null;
          address?: string | null;
          credit_limit?: number;
          term_of_payment_days?: number;
          is_active?: boolean;
        };
        Relationships: [];
      };
      sales_invoices: {
        Row: {
          id: string;
          invoice_number: string;
          customer_id: string;
          warehouse_id: string;
          transaction_date: string;
          term_of_payment_days: number;
          due_date: string;
          currency: string;
          exchange_rate: number;
          subtotal: number;
          discount_total: number;
          vat_amount: number;
          total_amount: number;
          status: SalesInvoiceStatus;
          amount_paid: number;
          returned_amount: number;
          tax_invoice_number: string | null;
          idempotency_key: string | null;
          journal_entry_id: string | null;
          cogs_journal_entry_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          posted_at: string | null;
        };
        Insert: {
          id?: string;
          invoice_number: string;
          customer_id: string;
          warehouse_id: string;
          transaction_date: string;
          term_of_payment_days?: number;
          due_date: string;
          currency?: string;
          exchange_rate?: number;
          subtotal: number;
          discount_total?: number;
          vat_amount?: number;
          total_amount: number;
          status?: SalesInvoiceStatus;
          amount_paid?: number;
          idempotency_key?: string | null;
          journal_entry_id?: string | null;
          cogs_journal_entry_id?: string | null;
          created_by?: string | null;
          posted_at?: string | null;
        };
        Update: {
          status?: SalesInvoiceStatus;
          amount_paid?: number;
          posted_at?: string | null;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          payment_number: string;
          customer_id: string;
          payment_date: string;
          amount: number;
          allocated_amount: number;
          currency: string;
          exchange_rate: number;
          debit_account_id: string | null;
          journal_entry_id: string | null;
          idempotency_key: string | null;
          created_by: string | null;
          created_at: string;
          posted_at: string | null;
        };
        Insert: {
          id?: string;
          payment_number: string;
          customer_id: string;
          payment_date: string;
          amount: number;
          allocated_amount?: number;
          currency?: string;
          exchange_rate?: number;
          debit_account_id?: string | null;
          journal_entry_id?: string | null;
          idempotency_key?: string | null;
          created_by?: string | null;
          posted_at?: string | null;
        };
        Update: {
          allocated_amount?: number;
          journal_entry_id?: string | null;
          posted_at?: string | null;
        };
        Relationships: [];
      };
      payment_allocations: {
        Row: {
          id: string;
          payment_id: string;
          sales_invoice_id: string;
          amount_applied: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          payment_id: string;
          sales_invoice_id: string;
          amount_applied: number;
        };
        Update: {
          amount_applied?: number;
        };
        Relationships: [];
      };
      exchange_rates: {
        Row: {
          id: string;
          currency: string;
          rate_date: string;
          rate: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          currency: string;
          rate_date: string;
          rate: number;
        };
        Update: { rate?: number };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          table_name: string;
          record_id: string | null;
          action: string;
          actor_id: string | null;
          ip_address: string | null;
          old_data: Json | null;
          new_data: Json | null;
          created_at: string;
        };
        Insert: {
          table_name: string;
          record_id?: string | null;
          action: string;
          actor_id?: string | null;
          ip_address?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
        };
        Update: { id?: never };
        Relationships: [];
      };
      nsfp_numbers: {
        Row: {
          id: string;
          serial_number: string;
          status: NsfpStatus;
          sales_invoice_id: string | null;
          assigned_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          serial_number: string;
          status?: NsfpStatus;
          sales_invoice_id?: string | null;
          assigned_at?: string | null;
        };
        Update: {
          status?: NsfpStatus;
          sales_invoice_id?: string | null;
          assigned_at?: string | null;
        };
        Relationships: [];
      };
      sales_returns: {
        Row: {
          id: string;
          return_number: string;
          sales_invoice_id: string;
          customer_id: string;
          warehouse_id: string;
          return_date: string;
          subtotal: number;
          discount_total: number;
          vat_amount: number;
          total_amount: number;
          cogs_amount: number;
          credit_note_journal_id: string | null;
          cogs_journal_id: string | null;
          idempotency_key: string | null;
          created_at: string;
          posted_at: string | null;
        };
        Insert: {
          id?: string;
          return_number: string;
          sales_invoice_id: string;
          customer_id: string;
          warehouse_id: string;
          return_date: string;
          subtotal: number;
          discount_total?: number;
          vat_amount?: number;
          total_amount: number;
          idempotency_key?: string | null;
        };
        Update: {
          cogs_amount?: number;
          posted_at?: string | null;
        };
        Relationships: [];
      };
      sales_return_items: {
        Row: {
          id: string;
          sales_return_id: string;
          product_id: string;
          sku: string;
          quantity: number;
          uom: string;
          conversion_to_base: number;
          base_quantity: number;
          unit_price: number;
          unit_cost: number;
          taxable: boolean;
          batch_number: string;
          expiry_date: string;
          line_subtotal: number;
          line_vat: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          sales_return_id: string;
          product_id: string;
          sku: string;
          quantity: number;
          uom: string;
          conversion_to_base: number;
          base_quantity: number;
          unit_price: number;
          unit_cost?: number;
          taxable?: boolean;
          batch_number: string;
          expiry_date: string;
          line_subtotal: number;
          line_vat?: number;
        };
        Update: {
          line_subtotal?: number;
        };
        Relationships: [];
      };
      sales_invoice_items: {
        Row: {
          id: string;
          sales_invoice_id: string;
          product_id: string;
          sku: string;
          quantity: number;
          uom: string;
          conversion_to_base: number;
          base_quantity: number;
          unit_price: number;
          taxable: boolean;
          batch_number: string | null;
          expiry_date: string | null;
          line_subtotal: number;
          line_vat: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          sales_invoice_id: string;
          product_id: string;
          sku: string;
          quantity: number;
          uom: string;
          conversion_to_base: number;
          base_quantity: number;
          unit_price: number;
          taxable?: boolean;
          batch_number?: string | null;
          expiry_date?: string | null;
          line_subtotal: number;
          line_vat?: number;
        };
        Update: {
          line_subtotal?: number;
          line_vat?: number;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      post_journal_entry: {
        Args: { p_payload: JournalPostPayload };
        Returns: Database['public']['Tables']['journal_entries']['Row'];
      };
      fulfill_inventory_fifo: {
        Args: {
          p_product_id: string;
          p_warehouse_id: string;
          p_qty_base: number;
        };
        Returns: FifoResult;
      };
      create_sales_invoice: {
        Args: { p: CreateSalesInvoicePayload };
        Returns: SalesInvoiceRpcResult;
      };
      record_payment: {
        Args: { p: RecordPaymentPayload };
        Returns: RecordPaymentResult;
      };
      report_trial_balance: {
        Args: { p_as_of: string };
        Returns: TrialBalanceResult;
      };
      report_profit_loss: {
        Args: { p_from: string; p_to: string };
        Returns: ProfitLossResult;
      };
      report_balance_sheet: {
        Args: { p_as_of: string };
        Returns: BalanceSheetResult;
      };
      create_sales_return: {
        Args: { p: CreateSalesReturnPayload };
        Returns: SalesReturnRpcResult;
      };
      customer_outstanding: {
        Args: { p_customer: string };
        Returns: number;
      };
      assign_pending_nsfp: {
        Args: Record<string, never>;
        Returns: AssignNsfpResult;
      };
      reverse_journal_entry: {
        Args: { p_entry_id: string; p_void?: boolean };
        Returns: Database['public']['Tables']['journal_entries']['Row'];
      };
      // Audited wrappers (migration 0012): set actor/IP then delegate.
      audited_post_journal_entry: {
        Args: { p: JournalPostPayload; _actor?: string; _ip?: string };
        Returns: Database['public']['Tables']['journal_entries']['Row'];
      };
      audited_create_sales_invoice: {
        Args: { p: CreateSalesInvoicePayload; _actor?: string; _ip?: string };
        Returns: SalesInvoiceRpcResult;
      };
      audited_record_payment: {
        Args: { p: RecordPaymentPayload; _actor?: string; _ip?: string };
        Returns: RecordPaymentResult;
      };
      audited_create_sales_return: {
        Args: { p: CreateSalesReturnPayload; _actor?: string; _ip?: string };
        Returns: SalesReturnRpcResult;
      };
      audited_reverse_journal_entry: {
        Args: {
          p_entry_id: string;
          p_void?: boolean;
          _actor?: string;
          _ip?: string;
        };
        Returns: Database['public']['Tables']['journal_entries']['Row'];
      };
      audited_fulfill_inventory_fifo: {
        Args: {
          p_product_id: string;
          p_warehouse_id: string;
          p_qty_base: number;
          _actor?: string;
          _ip?: string;
        };
        Returns: FifoResult;
      };
      audited_receive_stock: {
        Args: { p: ReceiveStockPayload; _actor?: string; _ip?: string };
        Returns: Database['public']['Tables']['inventory_batches']['Row'];
      };
      audited_transfer_stock: {
        Args: { p: TransferStockPayload; _actor?: string; _ip?: string };
        Returns: TransferStockResult;
      };
      audited_revalue_open_ar: {
        Args: { p: RevaluePayload; _actor?: string; _ip?: string };
        Returns: RevalueResult;
      };
    };
    Enums: {
      user_role: UserRole;
      account_type: AccountType;
      normal_balance: NormalBalance;
      valuation_method: ValuationMethodEnum;
      journal_status: JournalStatus;
      journal_source: JournalSourceEnum;
      sales_invoice_status: SalesInvoiceStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}

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
  batches: FifoBatchLine[];
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
    };
    Enums: {
      user_role: UserRole;
      account_type: AccountType;
      normal_balance: NormalBalance;
      valuation_method: ValuationMethodEnum;
      journal_status: JournalStatus;
      journal_source: JournalSourceEnum;
    };
    CompositeTypes: Record<string, never>;
  };
}

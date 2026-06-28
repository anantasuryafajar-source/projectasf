// Shared domain types mirroring the backend API responses.

export type Role = 'owner' | 'admin_gudang' | 'sales_kasir';

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  is_active: boolean;
}

export interface UomConversion {
  id: string;
  uom_name: string;
  quantity_in_base: number;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  base_uom: string;
  valuation_method: string;
  taxable: boolean;
  product_uom_conversions: UomConversion[];
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  npwp: string | null;
  address: string | null;
  credit_limit: number;
  term_of_payment_days: number;
  is_active: boolean;
}

export interface JournalEntry {
  id: string;
  journal_reference: string;
  entry_date: string;
  description: string | null;
  source: string;
  status: string;
  created_at: string;
}

export interface InventoryBatch {
  id: string;
  batch_number: string;
  expiry_date: string;
  quantity_on_hand: number;
  unit_cost: number;
}

// Human-friendly labels for roles.
export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin_gudang: 'Admin Gudang',
  sales_kasir: 'Sales / Kasir',
};

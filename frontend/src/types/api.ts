export type UserRole = "SUPER_ADMIN" | "DIRECTOR" | "MANAGER" | "OPERATOR";
export type AttributeTargetType = "PRODUCT" | "TX_INBOUND" | "TX_OUTBOUND";
export type FieldType = "TEXT" | "NUMBER" | "SELECT" | "DATE" | "BOOLEAN";
export type TransactionType = "INBOUND" | "OUTBOUND" | "ADJUSTMENT";

export interface Store {
  id: string;
  name: string;
  code?: string | null;
  address?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ConfiguredAttribute {
  id: string;
  key: string;
  label: string;
  field_type: "TEXT" | "NUMBER" | "DATE" | "SELECT";
  options?: string[];
  applies_to: "INBOUND" | "OUTBOUND" | "BOTH" | "PRODUCT";
  is_required?: boolean;
  default_value?: unknown;
}

export interface UserSummary {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  shift_name: string | null;
  store_id?: string | null;
  store_name?: string | null;
  is_active: boolean;
}

export interface UserRead extends UserSummary {
  store_id: string | null;
  store?: Store | null;
  created_by: string | null;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: UserSummary;
}

export interface UnitOfMeasure {
  id: string;
  code: string;
  name: string;
  plural_name: string | null;
  is_active: boolean;
}

export interface DictionaryItem {
  value: string;
  label: string;
  is_active: boolean;
}

export interface CustomDictionary {
  id: string;
  name: string;
  slug: string;
  items: DictionaryItem[];
  is_active: boolean;
  created_at: string;
}

export interface AttributeDefinition {
  id: string;
  target_type: AttributeTargetType;
  key: string;
  label: string;
  field_type: FieldType;
  dictionary_id: string | null;
  default_value: unknown;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
  dictionary: CustomDictionary | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
}

export interface AllowedUnit {
  unit_id: string;
  multiplier_to_base: string;
  unit: UnitOfMeasure;
}

export interface Product {
  id: string;
  barcode: string;
  name: string;
  sku: string;
  category_id: string | null;
  base_unit_id: string;
  secondary_unit_id: string | null;
  conversion_factor: string | null;
  current_stock_base: string;
  secondary_stock_calculated: string | null;
  stock_display: string;
  allow_negative_stock: boolean;
  enabled_attribute_ids: string[];
  configured_attributes?: ConfiguredAttribute[];
  custom_attributes: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category: Category | null;
  base_unit: UnitOfMeasure;
  secondary_unit: UnitOfMeasure | null;
  allowed_units: AllowedUnit[];
}

export interface InventoryTransaction {
  id: string;
  tx_type: TransactionType;
  product_id: string;
  quantity_entered: string;
  unit_id: string;
  quantity_base_calculated: string;
  stock_before_base: string;
  stock_after_base: string;
  performed_by_user_id: string;
  store_id?: string | null;
  counterparty_name: string;
  performed_at: string;
  custom_attributes: Record<string, unknown>;
  notes: string | null;
  created_at: string;
  product: {
    id: string;
    barcode: string;
    name: string;
    sku: string;
    base_unit: UnitOfMeasure;
    secondary_unit: UnitOfMeasure | null;
    conversion_factor: string | null;
  };
  unit: UnitOfMeasure;
  performed_by: {
    id: string;
    username: string;
    full_name: string;
    role: UserRole;
    shift_name: string | null;
  };
  store?: Store | null;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  payload: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
  user: {
    id: string;
    username: string;
    full_name: string;
    role: UserRole;
  } | null;
}

export interface AnalyticsSummary {
  total_active_products: number;
  zero_stock_products: number;
  inbound_today_count: number;
  outbound_today_count: number;
  transactions_last_24h: number;
  server_time_dushanbe: string;
}

export interface StoreStockBreakdown {
  store_id: string;
  store_name: string;
  store_code: string;
  store_address: string | null;
  stock_base: number;
  stock_secondary: number | null;
  stock_display: string;
  operations_count: number;
  last_operation_at: string | null;
}

export interface StoreMovementRow {
  id: string;
  store_id: string | null;
  store_name: string;
  store_code: string | null;
  product_id: string;
  barcode: string;
  product_name: string;
  tx_type: "INBOUND" | "OUTBOUND" | "ADJUSTMENT" | "INITIAL_STOCK";
  counterparty_name: string;
  quantity_entered: number;
  unit_name: string;
  current_store_stock: number;
  base_unit_name: string;
  performed_at: string;
  performed_by_name: string;
  performed_by_role: UserRole;
  custom_attributes: Record<string, unknown>;
  notes: string | null;
}


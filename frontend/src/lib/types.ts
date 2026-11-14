/** Server verdict strings — UI only paints these; never invents them. */
export type Verdict = "green" | "yellow" | "red" | "unknown";

export type Role =
  | "warehouse_staff"
  | "doctor"
  | "admin"
  | "community_partner"
  | "client";

export type TierId = "T1" | "T2" | "T3" | "T4" | "T5" | "T6" | "T7";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  displayName: string;
}

export interface VerdictReason {
  rule_id: string;
  source: string;
  message?: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  barcode: string | null;
  internal_code: string;
  stock: number;
  aisle: string;
  shelf: string;
  bin_code: string;
  batch_arrived: string;
  expires_on: string;
  sodium_mg: number | null;
  potassium_mg: number | null;
  phosphorus_mg: number | null;
  added_sugar_g: number | null;
  carb_g: number | null;
  allergens: string[];
  is_drink: boolean;
  weight_lb: number;
  swap_suggestions?: { id: string; name: string; location: string }[];
}

export interface ClientProfile {
  id: string;
  key: string;
  legal_name: string;
  first_name: string;
  phone: string;
  email: string;
  household_size: number;
  icd10: string[];
  tier: TierId;
  allergens: string[];
  k_limit_ordered: boolean;
  enrollment_status: "active" | "expired";
  card_token: string;
  dm: boolean;
  htn: boolean;
  ckd34: boolean;
}

export interface ScanResult {
  verdict: Verdict;
  reasons: VerdictReason[];
  product: Product | null;
  cap_limit?: number;
}

export interface CartLine {
  product: Product;
  verdict: Verdict;
  reasons: VerdictReason[];
  quantity: number;
}

export interface FloorArriveResult {
  session_id: string;
  status: "active" | "queued";
  tier_id: TierId;
  household_size: number;
  queue_position?: number;
  eta_minutes?: number;
  first_name?: string;
  diet_label?: string;
  enrollment_expired?: boolean;
}

export interface RuleRow {
  condition: string;
  nutrient: string;
  green_max: string;
  yellow_max: string;
  red_at: string;
  source: string;
  source_url: string;
  rd_confirm: boolean;
}

export interface AnalyticsKpis {
  clients_served: number;
  pounds_distributed: number;
  green_pct: number;
}

export interface AnalyticsPoint {
  label: string;
  value: number;
}

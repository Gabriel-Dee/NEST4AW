import type { Role, Verdict } from "@/lib/types";

/**
 * Live API. Screens paint `verdict` / `status.level` from payloads and do not invent one.
 * Set NEXT_PUBLIC_API_URL="" to use same-origin `/api/v1` via next.config rewrite (HTTPS UI).
 */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL === undefined
    ? "http://187.124.157.140:8010"
    : process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
export const API_V1 = API_URL ? `${API_URL}/api/v1` : "/api/v1";
export const USE_MOCK =
  String(process.env.NEXT_PUBLIC_USE_MOCK || "false").toLowerCase() === "true";

const TOKEN_KEY = "nest-access-token";
const VISIT_KEY = "nest-visit-token";
const KIOSK_KEY = "nest-kiosk-code";

export const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "Please sign in again.",
  forbidden: "You do not have access to that.",
  NOT_AT_STORE: "Check-in location is outside this store.",
  SESSION_INVALID: "Visit ended — check in again.",
  CHECKOUT_BLOCKED: "Checkout blocked until restricted items are removed.",
  floor_full: "please see a volunteer",
  not_found: "We could not find that.",
  VALIDATION_ERROR: "Some fields need a fix.",
  internal_error: "Server error — please see a volunteer.",
};

export const ALLERGENS = [
  "milk",
  "eggs",
  "fish",
  "crustacean_shellfish",
  "tree_nuts",
  "peanuts",
  "wheat",
  "soybeans",
  "sesame",
] as const;

export class ApiError extends Error {
  status: number;
  error: string;
  code: string;

  constructor(status: number, error: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.error = error;
    this.code = error;
  }
}

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  displayName: string;
};

export type SessionView = {
  session_id: string;
  status: string;
  tier_id: string;
  dm: boolean;
  htn: boolean;
  ckd34: boolean;
  k_limit_ordered: boolean;
  allergens: string[];
  household_size: number;
  lease_expires_at: string | null;
};

export type ScanReason = { rule_id?: string; source?: string; message?: string };

export type ScanProduct = {
  id: string;
  name: string;
  sodium_mg: number | null;
  potassium_mg: number | null;
  phosphorus_mg: number | null;
  added_sugar_g: number | null;
  carb_g: number | null;
  fiber_g: number | null;
  aisle: string | null;
  shelf: string | null;
  bin_code: string | null;
};

export type Swap = { id: string; name: string; location: string };

export type ScanHit = {
  verdict: Verdict;
  reasons: ScanReason[];
  product: ScanProduct | null;
  swaps: Swap[];
};

export type CartLine = {
  product_id: string;
  name: string;
  qty: number;
  verdict: Verdict;
  sodium_mg: number | null;
  aisle: string | null;
  shelf: string | null;
  bin_code: string | null;
};

export type CheckoutResult = {
  session_id: string;
  status: string;
  lines: {
    product_id: string;
    product_name: string;
    qty: number;
    grant_id: string;
    tier_id: string | null;
  }[];
};

export type ClientRecord = {
  id: string;
  legal_name: string;
  phone: string;
  email: string;
  household_size: number;
  icd10: string[];
  allergens: string[];
  k_limit_ordered: boolean;
  dm: boolean;
  htn: boolean;
  ckd34: boolean;
  tier_id: string;
  token_status: string;
  warnings: string[];
  card_token?: string;
};

export type StaffUser = {
  id: string;
  email: string;
  role: string;
  disabled: boolean;
};

export type MyProfile = {
  legal_name: string;
  email: string;
  tier_id: string;
  dm: boolean;
  htn: boolean;
  ckd34: boolean;
  k_limit_ordered: boolean;
  allergens: string[];
  household_size: number;
  token_status: string;
};

export type VisitRow = {
  product_name: string;
  grant_id: string;
  tier_id: string | null;
  qty: number;
  sold_at: string;
};

export type ReportRow = {
  day: string;
  tier_id: string;
  grant_id: string;
  units: number;
  pounds: number | null;
};

export type RuleRecord = {
  rule_id: string;
  color: string | null;
  threshold: number | null;
  source: string;
  source_url: string;
  rd_confirm: boolean;
  note: string;
};

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export function getVisitToken() {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(VISIT_KEY);
}

export function setVisitToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) sessionStorage.setItem(VISIT_KEY, token);
  else sessionStorage.removeItem(VISIT_KEY);
}

export function getKioskCode() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KIOSK_KEY);
}

export function setKioskCode(code: string | null) {
  if (typeof window === "undefined") return;
  if (code) localStorage.setItem(KIOSK_KEY, code);
  else localStorage.removeItem(KIOSK_KEY);
}

function errorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;
  const body = data as {
    message?: unknown;
    detail?: unknown;
    error?: { code?: string; message?: string } | string;
  };
  if (typeof body.error === "object" && body.error?.message) return body.error.message;
  if (typeof body.message === "string" && body.message) return body.message;
  if (typeof body.detail === "string" && body.detail) return body.detail;
  if (Array.isArray(body.detail)) {
    const first = body.detail[0] as { msg?: string } | undefined;
    if (first?.msg) return first.msg;
  }
  return fallback;
}

function errorCode(data: unknown) {
  if (!data || typeof data !== "object") return "request_failed";
  const body = data as { error?: { code?: string } | string };
  if (typeof body.error === "object" && body.error?.code) return body.error.code;
  if (typeof body.error === "string") return body.error;
  return "request_failed";
}

/** Legacy (unversioned) routes still used by staff/admin screens. */
export async function api<T>(
  path: string,
  init: RequestInit & { auth?: boolean; visit?: boolean; kiosk?: boolean } = {},
): Promise<T> {
  return request<T>(`${API_URL}${path}`, init);
}

/** Preferred /api/v1 client surface. */
export async function apiV1<T>(
  path: string,
  init: RequestInit & { auth?: boolean; visit?: boolean; kiosk?: boolean } = {},
): Promise<T> {
  const p = path.startsWith("/") ? path : `/${path}`;
  return request<T>(`${API_V1}${p}`, init);
}

async function request<T>(
  url: string,
  init: RequestInit & { auth?: boolean; visit?: boolean; kiosk?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (init.auth !== false) {
    const token = getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  if (init.visit) {
    const visit = getVisitToken();
    if (visit) headers.set("X-Visit-Token", visit);
  }
  if (init.kiosk) {
    const code = getKioskCode();
    if (code) headers.set("X-Kiosk-Code", code);
  }
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: "bad_response", message: text.slice(0, 200) };
    }
  }
  if (!res.ok) {
    const code = errorCode(data);
    const msg = errorMessage(data, res.statusText || "request failed");
    throw new ApiError(res.status, code, ERROR_MESSAGES[code] || msg);
  }
  return data as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function asRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (isRecord(data)) {
    for (const key of ["rows", "items", "products", "lots", "inventory", "lines"]) {
      const value = data[key];
      if (Array.isArray(value)) return value.filter(isRecord);
    }
  }
  return [];
}

const VERDICTS: Verdict[] = ["green", "yellow", "red", "unknown"];

function asVerdict(value: unknown): Verdict {
  return VERDICTS.includes(value as Verdict) ? (value as Verdict) : "unknown";
}

function reasonText(row: Record<string, unknown>) {
  if (typeof row.message === "string") return row.message;
  return [row.rule_id, row.source].filter((part) => typeof part === "string").join(" — ");
}

function swapsOf(data: Record<string, unknown>): Swap[] {
  const raw =
    data.swaps ?? data.alternatives ?? data.swap_suggestions ?? data.substitutions;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((row, index) => {
    const product = isRecord(row.product) ? row.product : row;
    const id = String(product.id ?? product.product_id ?? index);
    const name = String(product.name ?? "Swap");
    const location =
      typeof product.location === "string"
        ? product.location
        : [product.aisle, product.shelf, product.bin_code]
            .filter((part) => typeof part === "string" && part)
            .join(" · ");
    return { id, name, location };
  });
}

function productOf(raw: unknown): ScanProduct | null {
  if (!isRecord(raw)) return null;
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    sodium_mg: numOrNull(raw.sodium_mg),
    potassium_mg: numOrNull(raw.potassium_mg),
    phosphorus_mg: numOrNull(raw.phosphorus_mg),
    added_sugar_g: numOrNull(raw.added_sugar_g),
    carb_g: numOrNull(raw.carb_g),
    fiber_g: numOrNull(raw.fiber_g),
    aisle: raw.aisle == null ? null : String(raw.aisle),
    shelf: raw.shelf == null ? null : String(raw.shelf),
    bin_code: raw.bin_code == null ? null : String(raw.bin_code),
  };
}

function numOrNull(value: unknown) {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function roleHome(role: Role) {
  switch (role) {
    case "warehouse_staff":
      return "/checkout";
    case "doctor":
      return "/admin/clinical";
    case "admin":
      return "/admin";
    case "community_partner":
      return "/admin/analytics";
    case "client":
      return "/me";
  }
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const row = await apiV1<{ access_token: string }>("/auth/login", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ email: email.trim(), password }),
  });
  setAccessToken(row.access_token);
  return me();
}

export async function me(): Promise<AuthUser> {
  const row = await apiV1<{ id: string; email: string; role: Role }>("/auth/me");
  return { id: row.id, email: row.email, role: row.role, displayName: row.email };
}

export type KioskCheckInResult = {
  status: string;
  visit_token?: string;
  queue_position?: number | null;
  store?: { id: string; name: string };
};

export async function kioskCheckIn(body: { client_code?: string; qr_token?: string }) {
  const row = await apiV1<KioskCheckInResult>("/kiosk/check-in", {
    method: "POST",
    auth: false,
    kiosk: true,
    body: JSON.stringify(body),
  });
  if (row.visit_token) setVisitToken(row.visit_token);
  return row;
}

/** Payload phones scan on /check-in (must match mobile parseStoreCheckInQr). */
export function storeCheckInQrPayload(storeId: string) {
  return `NEST4AW:CHECKIN:${storeId}`;
}

export type StoreListRow = {
  id: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
};

export async function listStoresV1(lat = 29.8947, lng = -81.3145) {
  const data = await apiV1<unknown>(`/stores?lat=${lat}&lng=${lng}`);
  const rows = Array.isArray(data) ? data : [];
  return rows.filter(isRecord).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? "Store"),
    address: row.address == null ? undefined : String(row.address),
    lat: typeof row.lat === "number" ? row.lat : undefined,
    lng: typeof row.lng === "number" ? row.lng : undefined,
  })) as StoreListRow[];
}

export async function healthV1() {
  return apiV1<{ db: string; ai: string; embeddings: string }>("/health", { auth: false });
}

export async function listDevBarcodes() {
  return apiV1<unknown>("/dev/barcodes", { auth: false });
}

export function logout() {
  setAccessToken(null);
}

/** @deprecated Legacy card-token floor arrive. Prefer kioskCheckIn({ qr_token }) or geofence. */
export function arrive(token: string) {
  return api<SessionView>("/floor/arrive", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ token }),
  });
}

export function getSession(sessionId: string) {
  return api<SessionView>(`/sessions/${sessionId}`, { auth: false });
}

export async function scan(sessionId: string, code: string): Promise<ScanHit> {
  const trimmed = code.trim();
  const body: Record<string, string> = { session_id: sessionId };
  if (/^\d{8,14}$/.test(trimmed)) body.barcode = trimmed;
  else body.internal_code = trimmed;
  const row = await api<Record<string, unknown>>("/scan", {
    method: "POST",
    auth: false,
    body: JSON.stringify(body),
  });
  const reasons = Array.isArray(row.reasons) ? row.reasons.filter(isRecord) : [];
  return {
    verdict: asVerdict(row.verdict),
    reasons: reasons.map((reason) => ({
      rule_id: typeof reason.rule_id === "string" ? reason.rule_id : undefined,
      source: typeof reason.source === "string" ? reason.source : undefined,
      message: reasonText(reason) || undefined,
    })),
    product: productOf(row.product),
    swaps: swapsOf(row),
  };
}

export function addLine(sessionId: string, productId: string) {
  return api<CartLine>("/cart/lines", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ session_id: sessionId, product_id: productId }),
  });
}

export function deleteLine(sessionId: string, productId: string) {
  const q = new URLSearchParams({ session_id: sessionId });
  return api<{ ok: boolean }>(`/cart/lines/${productId}?${q}`, {
    method: "DELETE",
    auth: false,
  });
}

export async function getCart(sessionId: string) {
  const q = new URLSearchParams({ session_id: sessionId });
  const row = await api<unknown>(`/cart?${q}`, { auth: false });
  const lines = Array.isArray(row)
    ? row
    : isRecord(row) && Array.isArray(row.lines)
      ? row.lines
      : [];
  return lines.filter(isRecord).map((line) => ({
    product_id: String(line.product_id ?? ""),
    name: String(line.name ?? ""),
    qty: Number(line.qty ?? 1),
    verdict: asVerdict(line.verdict),
    sodium_mg: numOrNull(line.sodium_mg),
    aisle: line.aisle == null ? null : String(line.aisle),
    shelf: line.shelf == null ? null : String(line.shelf),
    bin_code: line.bin_code == null ? null : String(line.bin_code),
  }));
}

function ledgerLines(row: unknown): CheckoutResult["lines"] {
  const rows = Array.isArray(row)
    ? row
    : isRecord(row) && Array.isArray(row.lines)
      ? row.lines
      : [];
  return rows.filter(isRecord).map((line) => ({
    product_id: String(line.product_id ?? ""),
    product_name: String(line.product_name ?? line.name ?? ""),
    qty: Number(line.qty ?? 0),
    grant_id: String(line.grant_id ?? ""),
    tier_id: line.tier_id == null ? null : String(line.tier_id),
  }));
}

export type ExitReview = {
  sessionId: string;
  code: string;
  store: string | null;
  client: {
    name: string;
    tier_id: string;
    household_size: number;
    dm: boolean;
    htn: boolean;
    ckd34: boolean;
    k_limit_ordered: boolean;
    allergens: string[];
  };
  lines: (CartLine & { mustRemove: boolean; reason: string })[];
  canPass: boolean;
};

/** Staff: load a shopper at the exit by their QR payload or 4-digit checkout code. */
export async function lookupCheckoutCode(code: string): Promise<ExitReview> {
  const row = await apiV1<Record<string, unknown>>(`/staff/checkout/${encodeURIComponent(code.trim())}`);
  const client = isRecord(row.client) ? row.client : {};
  const cart = isRecord(row.cart) ? row.cart : {};
  const items = Array.isArray(cart.items) ? cart.items.filter(isRecord) : [];
  return {
    sessionId: String(row.session_id ?? ""),
    code: String(row.code ?? ""),
    store: typeof row.store === "string" ? row.store : null,
    client: {
      name: String(client.name ?? ""),
      tier_id: String(client.tier_id ?? ""),
      household_size: Number(client.household_size ?? 1),
      dm: Boolean(client.dm),
      htn: Boolean(client.htn),
      ckd34: Boolean(client.ckd34),
      k_limit_ordered: Boolean(client.k_limit_ordered),
      allergens: Array.isArray(client.allergens) ? client.allergens.map(String) : [],
    },
    lines: items.map((item) => {
      const product = isRecord(item.product) ? item.product : {};
      const status = isRecord(item.status) ? item.status : {};
      const level = asVerdict(status.level);
      const mustRemove = Boolean(item.must_remove);
      return {
        product_id: String(product.id ?? ""),
        name: String(product.name ?? "Item"),
        qty: Number(item.qty ?? 1),
        verdict: mustRemove ? (level === "red" ? "red" : "unknown") : level,
        sodium_mg: typeof product.sodium_mg === "number" ? product.sodium_mg : null,
        aisle: null,
        shelf: null,
        bin_code: null,
        mustRemove,
        reason: String(status.label ?? ""),
      };
    }),
    canPass: Boolean(row.can_pass),
  };
}

export async function checkout(sessionId: string): Promise<CheckoutResult> {
  const row = await api<unknown>("/checkout", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (isRecord(row) && !Array.isArray(row)) {
    return {
      session_id: String(row.session_id ?? sessionId),
      status: String(row.status ?? "closed"),
      lines: ledgerLines(row),
    };
  }
  return { session_id: sessionId, status: "closed", lines: ledgerLines(row) };
}

export function listClients() {
  return api<ClientRecord[]>("/clients");
}

export function createClient(body: {
  legal_name: string;
  phone: string;
  email: string;
  password: string;
  household_size: number;
  icd10: string[];
  allergens: string[];
  k_limit_ordered: boolean;
}) {
  return api<ClientRecord>("/clients", { method: "POST", body: JSON.stringify(body) });
}

export function patchClient(
  id: string,
  body: {
    phone?: string;
    household_size?: number;
    icd10?: string[];
    allergens?: string[];
    k_limit_ordered?: boolean;
  },
) {
  return api<ClientRecord>(`/clients/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function revokeToken(id: string) {
  return api<{ token_status: string }>(`/clients/${id}/tokens/revoke`, { method: "POST" });
}

export type StaffMatch = {
  client_id: string;
  legal_name: string;
  tier_id: string;
  token_status: string;
};

export async function lookupClient(name: string): Promise<StaffMatch[]> {
  const row = await api<unknown>("/staff/lookup", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  const rows = Array.isArray(row) ? row : isRecord(row) ? [row] : [];
  return rows.filter(isRecord).map((item) => ({
    client_id: String(item.client_id ?? ""),
    legal_name: String(item.legal_name ?? ""),
    tier_id: String(item.tier_id ?? ""),
    token_status: String(item.token_status ?? ""),
  }));
}

export function reissueCard(clientId: string) {
  return api<{ card_token: string }>("/staff/reissue", {
    method: "POST",
    body: JSON.stringify({ client_id: clientId }),
  });
}

export function listInventory() {
  return api<unknown>("/inventory");
}

export function listProducts(q = "") {
  const params = new URLSearchParams({ limit: "200" });
  if (q) params.set("q", q);
  return api<unknown>(`/products?${params}`);
}

export function listLots(productId?: string) {
  const params = new URLSearchParams();
  if (productId) params.set("product_id", productId);
  const q = params.toString();
  return api<unknown>(`/lots${q ? `?${q}` : ""}`);
}

export function floorBoard() {
  return api<{
    active_count: number;
    queued_count: number;
    max_floor: number;
    max_queue: number;
    rows: {
      session_id: string;
      status: string;
      tier_id: string | null;
      queued_at: string | null;
    }[];
  }>("/floor/board");
}

export function listRules() {
  return api<RuleRecord[]>("/rules");
}

export function dispensedReport(from: string, to: string) {
  const q = new URLSearchParams({ from, to });
  return api<ReportRow[]>(`/reports/dispensed?${q}`);
}

export function listUsers() {
  return api<StaffUser[]>("/admin/users");
}

export function createUser(body: { email: string; password: string; role: string }) {
  return api<StaffUser>("/admin/users", { method: "POST", body: JSON.stringify(body) });
}

export function patchUser(id: string, body: { disabled?: boolean; role?: string }) {
  return api<StaffUser>(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function myProfile() {
  return api<MyProfile>("/me/profile");
}

export function myVisits() {
  return api<VisitRow[]>("/me/visits");
}

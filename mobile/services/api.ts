import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { recipes, type Recipe } from '../data/mock';

const RAW_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://187.124.157.140:8010').replace(/\/$/, '');
const API_URL = RAW_URL.endsWith('/api/v1') ? RAW_URL : `${RAW_URL}/api/v1`;
export const USE_MOCK = String(process.env.EXPO_PUBLIC_USE_MOCK || 'false').toLowerCase() === 'true';

const TOKEN_KEY = 'nest_access_token';
const VISIT_KEY = 'nest_visit_token';

export type Verdict = 'green' | 'yellow' | 'red';
export type Group = 'Produce' | 'Proteins' | 'Dairy' | 'Grains' | 'Pantry';
export type Product = {
  sku: string;
  name: string;
  group: Group;
  verdict: Verdict;
  reason: string;
  sodiumMg: number;
  sugarG: number;
  potassiumMg: number;
  carbsG: number;
  aisle: string;
  shelf: string;
  bin: string;
  suggestedQty: number;
  icon: 'leaf' | 'nutrition' | 'fish' | 'egg' | 'cafe' | 'grid' | 'cube' | 'water';
  alternativeSkus: string[];
  productId?: string;
};

export type Session = {
  id: string;
  firstName: string;
  householdSize: number;
  planBadge: string;
  conditionsLabel: string;
  guides: { sodiumMg: number; addedSugarG: number; potassiumMg: number; carbsG: number };
};

export type { Recipe };

export const CONDITIONS = ['Type 2 Diabetes', 'Hypertension', 'Chronic Kidney Disease', 'Other'] as const;
export const ALLERGIES = ['Nuts', 'Dairy', 'Gluten', 'Shellfish', 'Egg', 'Soy'] as const;
export const PREFERENCES = ['Vegetarian', 'Halal'] as const;

export type ClientProfile = {
  firstName: string;
  lastName: string;
  clientCode: string;
  householdSize: number;
  conditions: string[];
  allergies: string[];
  preferences: string[];
  planBadge: string;
  planLine: string;
};

export type CartLine = { product: Product; qty: number };
export type CartSnapshot = {
  lines: CartLine[];
  great: number;
  limit: number;
  points: number;
  greensInCart: number;
  greenGoal: number;
  listComplete: boolean;
  nutrient_totals?: Record<string, number>;
};
export type RecipeCard = Recipe & { usesFromCart: number; missing: Product | null; saved: boolean; source?: string };
export type SafetyNote = { tone: 'green' | 'yellow' | 'red' | 'plain'; title: string; body: string };

export type StoreRow = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distance_m?: number;
  is_open: boolean;
  on_floor: number;
  waiting: number;
  max_capacity: number;
  inside_geofence?: boolean;
  geofence_radius_m?: number;
};

const GUIDES = { sodiumMg: 460, addedSugarG: 0.5, potassiumMg: 1000, carbsG: 30 };
const ALLERGEN_LABEL: Record<string, string> = {
  peanuts: 'Nuts',
  tree_nuts: 'Nuts',
  milk: 'Dairy',
  wheat: 'Gluten',
  crustacean_shellfish: 'Shellfish',
  eggs: 'Egg',
  soybeans: 'Soy',
};
const CONDITION_ICD: Record<string, string> = {
  'Type 2 Diabetes': 'E11.9',
  type_2_diabetes: 'E11.9',
  Hypertension: 'I10',
  hypertension: 'I10',
  'Chronic Kidney Disease': 'N18.3',
  ckd_stage_3_4: 'N18.3',
};
const ALLERGY_CODE: Record<string, string> = {
  Nuts: 'peanuts',
  Dairy: 'milk',
  Gluten: 'wheat',
  Shellfish: 'crustacean_shellfish',
  Egg: 'eggs',
  Soy: 'soybeans',
};

export const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'Please sign in again.',
  forbidden: 'You do not have access to that.',
  NOT_AT_STORE: "You're not at the store yet. Check in when you arrive.",
  not_at_store: "You're not at the store yet. Check in when you arrive.",
  SESSION_INVALID: 'Your store visit ended. Check in again.',
  floor_full: 'The floor is full — please see a volunteer.',
  store_closed: 'This store is closed right now.',
  CHECKOUT_BLOCKED: 'Checkout is blocked until restricted items are removed.',
  RED_RESTRICTED: 'That item is not for your plan today.',
  OVER_LIMIT: 'That is over the limit for your plan.',
  not_found: 'We could not find that.',
  VALIDATION_ERROR: 'Some fields need a fix.',
  internal_error: 'Something went wrong on the server. Please see a volunteer.',
};

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

type Floor = {
  sessionId: string | null;
  token: string | null;
  visitToken: string | null;
  firstName: string;
  lastName: string;
  householdSize: number;
  planBadge: string;
  planLine: string;
  tierId: string;
  dm: boolean;
  htn: boolean;
  ckd34: boolean;
  allergens: string[];
  preferences: string[];
  conditions: string[];
  clientCode: string;
  email: string;
};

let floor: Floor | null = null;
let points = 0;
let counted = new Set<string>();
let savedIds: string[] = [];
let recipePointGiven = false;
let catalog: Product[] = [];
let greenGoal = 0;
const scanLog: {
  code: string;
  product: string;
  expected?: string;
  actual?: string;
  ms: number;
  resolved_by?: string;
  at: string;
}[] = [];

const memoryStore = new Map<string, string>();

async function storeGet(key: string) {
  if (Platform.OS === 'web') return memoryStore.get(key) ?? null;
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return memoryStore.get(key) ?? null;
  }
}
async function storeSet(key: string, value: string | null) {
  if (value == null) {
    memoryStore.delete(key);
    if (Platform.OS !== 'web') {
      try {
        await SecureStore.deleteItemAsync(key);
      } catch {
        /* ignore */
      }
    }
    return;
  }
  memoryStore.set(key, value);
  if (Platform.OS !== 'web') {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      /* ignore */
    }
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function num(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}
function friendly(code: string, fallback: string) {
  return ERROR_MESSAGES[code] || fallback;
}

export async function call<T>(
  path: string,
  init: RequestInit & { auth?: boolean; visit?: boolean; kioskCode?: string } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = floor?.token || (await storeGet(TOKEN_KEY));
  const visit = floor?.visitToken || (await storeGet(VISIT_KEY));
  if (init.auth !== false && token) headers.set('Authorization', `Bearer ${token}`);
  if (init.visit !== false && visit) headers.set('X-Visit-Token', visit);
  if (init.kioskCode) headers.set('X-Kiosk-Code', init.kioskCode);

  const res = await fetch(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`, { ...init, headers });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!res.ok) {
    const body = (data ?? {}) as {
      error?: { code?: string; message?: string } | string;
      message?: string;
    };
    const code =
      typeof body.error === 'object' && body.error
        ? String(body.error.code || 'request_failed')
        : typeof body.error === 'string'
          ? body.error
          : 'request_failed';
    const message =
      typeof body.error === 'object' && body.error?.message
        ? body.error.message
        : typeof body.message === 'string'
          ? body.message
          : friendly(code, 'please see a volunteer');
    throw new ApiError(res.status, code, friendly(code, message));
  }
  return data as T;
}

function planFrom(flags: { dm: boolean; htn: boolean; ckd34: boolean; tier_id?: string }) {
  const { dm, htn, ckd34 } = flags;
  let name = 'Your plan';
  let planLine = 'Food that fits your household';
  if ((dm || htn) && ckd34) {
    name = 'Heart and kidney friendly';
    planLine = 'Lower salt, lower sugar';
  } else if (dm && htn) {
    name = 'Heart and sugar friendly';
    planLine = 'Lower salt, lower sugar';
  } else if (ckd34) {
    name = 'Kidney friendly';
    planLine = 'Lower salt';
  } else if (htn) {
    name = 'Heart friendly';
    planLine = 'Lower salt';
  } else if (dm) {
    name = 'Sugar friendly';
    planLine = 'Lower sugar';
  }
  const planBadge = flags.tier_id ? `${flags.tier_id} · ${name}` : name;
  const conditions = [
    dm ? 'Type 2 Diabetes' : null,
    htn ? 'Hypertension' : null,
    ckd34 ? 'Chronic Kidney Disease' : null,
  ].filter((item): item is string => Boolean(item));
  return { planBadge, planLine, conditions };
}

function allergyLabels(codes: string[]) {
  return Array.from(new Set(codes.map((code) => ALLERGEN_LABEL[code] || code)));
}

function groupOf(category: string): Group {
  const value = category.toLowerCase();
  if (value.includes('produce') || value.includes('fruit') || value.includes('vegetable')) return 'Produce';
  if (value.includes('protein') || value.includes('meat') || value.includes('seafood') || value.includes('fish'))
    return 'Proteins';
  if (value.includes('dairy') || value.includes('milk')) return 'Dairy';
  if (value.includes('grain') || value.includes('bread') || value.includes('rice')) return 'Grains';
  return 'Pantry';
}

function iconFor(group: Group): Product['icon'] {
  if (group === 'Produce') return 'leaf';
  if (group === 'Proteins') return 'nutrition';
  if (group === 'Dairy') return 'cafe';
  if (group === 'Grains') return 'grid';
  return 'cube';
}

function verdictOf(value: unknown): Verdict | null {
  if (value === 'green' || value === 'yellow' || value === 'red') return value;
  return null;
}

function mapStore(raw: Record<string, unknown>): StoreRow {
  const floorObj = record(raw.floor) ? raw.floor : {};
  return {
    id: String(raw.id),
    name: String(raw.name ?? 'Store'),
    address: [raw.address, raw.city].filter((p) => typeof p === 'string' && p).join(', '),
    lat: num(raw.lat),
    lng: num(raw.lng),
    distance_m: raw.distance_m == null ? undefined : num(raw.distance_m),
    is_open: Boolean(raw.is_open),
    on_floor: num(floorObj.active ?? raw.on_floor),
    waiting: num(floorObj.queue_length ?? raw.waiting),
    max_capacity: num(floorObj.max ?? raw.max_capacity),
    inside_geofence: Boolean(raw.within_geofence ?? raw.inside_geofence),
    geofence_radius_m: raw.geofence_radius_m == null ? undefined : num(raw.geofence_radius_m),
  };
}

function toProduct(raw: Record<string, unknown>, household: number): Product | null {
  const product = record(raw.product) ? raw.product : raw;
  const status = record(raw.status) ? raw.status : null;
  const nutrients = record(raw.nutrients) ? raw.nutrients : product;
  let verdict = verdictOf(status?.level ?? raw.verdict ?? product.verdict);
  if (!verdict && (raw.product_id || product.id) && (status || raw.reason || Array.isArray(raw.reasons))) {
    verdict = 'green';
  }
  if (!verdict) return null;
  const id = String(product.id ?? product.product_id ?? raw.product_id ?? '');
  const sku = String(product.sku ?? product.internal_code ?? product.barcode ?? raw.sku ?? id);
  if (!sku) return null;
  const location = record(product.location)
    ? product.location
    : record(raw.location)
      ? raw.location
      : {};
  const group = groupOf(String(product.category ?? product.group ?? raw.category ?? ''));
  const reason =
    (typeof status?.reason === 'string' && status.reason) ||
    (typeof status?.label === 'string' && status.label) ||
    (typeof raw.reason === 'string' ? raw.reason : '');
  return {
    sku,
    productId: id || undefined,
    name: String(product.name ?? 'Item'),
    group,
    verdict,
    reason,
    sodiumMg: num(nutrients.sodium_mg ?? nutrients.sodiumMg),
    sugarG: num(nutrients.sugar_g ?? nutrients.added_sugar_g ?? nutrients.sugarG),
    potassiumMg: num(nutrients.potassium_mg ?? nutrients.potassiumMg),
    carbsG: num(nutrients.carbs_g ?? nutrients.carb_g ?? nutrients.carbsG),
    aisle: String(location.aisle ?? product.aisle ?? ''),
    shelf: String(location.shelf ?? product.shelf ?? ''),
    bin: String(location.bin ?? product.bin_code ?? product.bin ?? location.label ?? ''),
    suggestedQty: num(raw.suggested_qty ?? raw.suggested_quantity ?? status?.limit_qty ?? household) || household,
    icon: iconFor(group),
    alternativeSkus: [],
  };
}

function applyClient(
  client: Record<string, unknown>,
  email: string,
  token: string,
  names?: { firstName: string; lastName: string },
) {
  const flags = {
    dm: Boolean(client.dm),
    htn: Boolean(client.htn),
    ckd34: Boolean(client.ckd34),
    tier_id: String(client.tier_id ?? ''),
  };
  const plan = planFrom(flags);
  floor = {
    sessionId: floor?.sessionId ?? null,
    token,
    visitToken: floor?.visitToken ?? null,
    firstName: names?.firstName || String(client.first_name ?? floor?.firstName ?? 'there'),
    lastName: names?.lastName || String(client.last_name ?? floor?.lastName ?? ''),
    householdSize: num(client.household_size) || 1,
    planBadge: String(client.plan_badge ?? plan.planBadge),
    planLine: plan.planLine,
    tierId: flags.tier_id,
    dm: flags.dm,
    htn: flags.htn,
    ckd34: flags.ckd34,
    allergens: Array.isArray(client.allergens)
      ? client.allergens.map(String)
      : Array.isArray(client.allergies)
        ? client.allergies.map(String)
        : [],
    preferences: floor?.preferences ?? [],
    conditions: plan.conditions,
    clientCode: String(client.client_code ?? ''),
    email,
  };
}

export function isCheckedIn() {
  return Boolean(floor?.visitToken || floor?.token || floor?.sessionId);
}

export async function restoreSession() {
  const token = await storeGet(TOKEN_KEY);
  const visit = await storeGet(VISIT_KEY);
  if (!token) return false;
  try {
    const me = await call<Record<string, unknown>>('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
      visit: false,
    });
    const client = record(me.client) ? me.client : {};
    applyClient(client, String(me.email ?? ''), token);
    if (floor && visit) {
      floor.visitToken = visit;
      floor.sessionId = visit;
    }
    return true;
  } catch {
    await storeSet(TOKEN_KEY, null);
    await storeSet(VISIT_KEY, null);
    floor = null;
    return false;
  }
}

export async function login(email: string, password: string) {
  const row = await call<{ access_token: string; client?: Record<string, unknown> }>('/auth/login', {
    method: 'POST',
    auth: false,
    visit: false,
    body: JSON.stringify({ email: email.trim(), password }),
  });
  await storeSet(TOKEN_KEY, row.access_token);
  const me = await call<Record<string, unknown>>('/auth/me', {
    headers: { Authorization: `Bearer ${row.access_token}` },
    visit: false,
  });
  const client = record(me.client) ? me.client : record(row.client) ? row.client : {};
  applyClient(client, String(me.email ?? email), row.access_token);
  return profileFrom(floor!);
}

export async function register(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  householdSize: number;
  conditions: string[];
  allergies: string[];
}) {
  const icd10_codes = input.conditions.map((c) => CONDITION_ICD[c]).filter(Boolean);
  const allergies = input.allergies.map((a) => ALLERGY_CODE[a] || a.toLowerCase()).filter(Boolean);
  const row = await call<{ access_token: string; client?: Record<string, unknown> }>('/auth/register', {
    method: 'POST',
    auth: false,
    visit: false,
    body: JSON.stringify({
      first_name: input.firstName,
      last_name: input.lastName,
      phone: input.phone || null,
      email: input.email.trim(),
      password: input.password,
      household_size: input.householdSize,
      icd10_codes,
      allergies,
    }),
  });
  await storeSet(TOKEN_KEY, row.access_token);
  applyClient(record(row.client) ? row.client! : {}, input.email, row.access_token, {
    firstName: input.firstName,
    lastName: input.lastName,
  });
  return profileFrom(floor!);
}

/** Email login helper used by the welcome screen (email in firstName, password in lastName). */
export async function checkIn(input: { firstName: string; lastName: string; clientCode: string }) {
  const first = input.firstName.trim();
  const last = input.lastName.trim();
  const code = input.clientCode.trim();
  try {
    if (first.includes('@')) {
      await login(first, last || code);
      return { ok: true as const, profile: profileFrom(floor!) };
    }
    if (code.includes('@')) {
      await login(code, last || first);
      return { ok: true as const, profile: profileFrom(floor!) };
    }
    return {
      ok: false as const,
      message: 'Sign in with email (first field) and password (last field), then open Stores to check in.',
    };
  } catch (err) {
    floor = null;
    return { ok: false as const, message: err instanceof ApiError ? err.message : 'please see a volunteer' };
  }
}

function profileFrom(person: Floor): ClientProfile {
  return {
    firstName: person.firstName,
    lastName: person.lastName,
    clientCode: person.clientCode || person.sessionId || '',
    householdSize: person.householdSize,
    conditions: [...person.conditions],
    allergies: allergyLabels(person.allergens),
    preferences: [...person.preferences],
    planBadge: person.planBadge,
    planLine: person.planLine,
  };
}

export async function getProfile(): Promise<ClientProfile | null> {
  if (!floor) return null;
  return profileFrom(floor);
}

export async function saveProfile(
  next: Pick<ClientProfile, 'householdSize' | 'conditions' | 'allergies' | 'preferences'>,
) {
  if (!floor) return { ok: false as const, message: 'Sign in first.' };
  floor = { ...floor, preferences: [...next.preferences], householdSize: next.householdSize };
  return { ok: true as const, profile: { ...profileFrom(floor), ...next } };
}

export async function listStores(lat: number, lng: number): Promise<StoreRow[]> {
  const data = await call<unknown>(`/stores?lat=${lat}&lng=${lng}`, { visit: false });
  const rows = Array.isArray(data) ? data : record(data) && Array.isArray(data.stores) ? data.stores : [];
  return rows.filter(record).map(mapStore);
}

export async function nearestStore(lat: number, lng: number): Promise<StoreRow | null> {
  const data = await call<Record<string, unknown>>(`/stores/nearest?lat=${lat}&lng=${lng}`, { visit: false });
  return record(data) ? mapStore(data) : null;
}

export async function getStore(id: string): Promise<StoreRow | null> {
  const data = await call<Record<string, unknown>>(`/stores/${id}`, { visit: false });
  return record(data) ? mapStore(data) : null;
}

export async function geofenceCheckIn(storeId: string, lat: number, lng: number, accuracy_m = 10) {
  const row = await call<Record<string, unknown>>(`/stores/${storeId}/check-in`, {
    method: 'POST',
    visit: false,
    body: JSON.stringify({ lat, lng, accuracy_m }),
  });
  const visit = String(row.visit_token ?? '');
  if (visit && floor) {
    floor.visitToken = visit;
    floor.sessionId = visit;
    await storeSet(VISIT_KEY, visit);
  }
  return row;
}

export async function leaveStore() {
  await call('/visits/current/leave', { method: 'POST' });
  if (floor) floor.visitToken = null;
  await storeSet(VISIT_KEY, null);
}

export async function getCheckinQr() {
  const row = await call<{ qr_token?: string; token?: string; expires_in: number }>('/auth/me/checkin-qr', {
    visit: false,
  });
  return { token: row.qr_token || row.token || '', expires_in: row.expires_in };
}

export async function getSafetyAdvice(): Promise<{ planBadge: string; planLine: string; notes: SafetyNote[] }> {
  const person = floor;
  const notes: SafetyNote[] = [
    { tone: 'green', title: 'Green means great choice', body: 'This food fits your plan. You can take it.' },
    { tone: 'yellow', title: 'Yellow means limit', body: 'A small amount is fine. The card shows the limit.' },
    { tone: 'red', title: 'Red means not today', body: 'This food is not for your plan today. The card says why.' },
  ];
  if (person?.dm) notes.push({ tone: 'plain', title: 'Diabetes flag', body: 'Diabetes is on your plan.' });
  if (person?.htn) notes.push({ tone: 'plain', title: 'Hypertension flag', body: 'Hypertension is on your plan.' });
  if (person?.ckd34) notes.push({ tone: 'plain', title: 'Kidney flag', body: 'CKD stage 3–4 is on your plan.' });
  if (person && person.allergens.length > 0) {
    notes.push({
      tone: 'plain',
      title: 'Allergies',
      body: `Listed: ${allergyLabels(person.allergens).join(', ')}.`,
    });
  }
  return { planBadge: person?.planBadge || 'Your plan', planLine: person?.planLine || '', notes };
}

export async function getSession() {
  const person = floor;
  const greensInCart = (await cartLines()).filter((line) => line.product.verdict === 'green').length;
  return {
    id: person?.sessionId || person?.visitToken || '',
    firstName: person?.firstName || 'there',
    householdSize: person?.householdSize || 1,
    planBadge: person?.planBadge || 'Your plan',
    conditionsLabel: person?.conditions.join(', ') || 'No conditions on file',
    guides: GUIDES,
    points,
    greensInCart,
    greenGoal,
    planLine: person?.planLine || '',
    allergies: person ? allergyLabels(person.allergens) : [],
    preferences: person ? [...person.preferences] : [],
  };
}

export async function getRecommendations(): Promise<Product[]> {
  if (USE_MOCK) return catalog;
  if (!floor?.visitToken && !floor?.token) return catalog;
  try {
    const data = await call<unknown>('/recommendations');
    const rows = Array.isArray(data)
      ? data
      : record(data) && Array.isArray(data.products)
        ? data.products
        : record(data) && Array.isArray(data.items)
          ? data.items
          : [];
    const next = rows
      .filter(record)
      .map((row) => toProduct(row, floor?.householdSize || 1))
      .filter((item): item is Product => item !== null);
    catalog = next;
    greenGoal = next.filter((item) => item.verdict === 'green').length;
    return next;
  } catch {
    return catalog;
  }
}

export async function scanItem(sku: string, expected?: string): Promise<Product | null> {
  const code = sku.trim();
  if (!code) return null;
  const t0 = Date.now();
  try {
    const row = await call<Record<string, unknown>>('/scan', {
      method: 'POST',
      body: JSON.stringify({ code, source: 'manual' }),
    });
    const product = toProduct(row, floor?.householdSize || 1);
    const actual = product?.verdict;
    scanLog.unshift({
      code,
      product: product?.name || '(none)',
      expected,
      actual: actual || undefined,
      ms: Date.now() - t0,
      resolved_by: String(row.resolved_by ?? ''),
      at: new Date().toISOString(),
    });
    if (!product) return null;
    const alts = Array.isArray(row.alternatives) ? row.alternatives : Array.isArray(row.swaps) ? row.swaps : [];
    product.alternativeSkus = alts
      .filter(record)
      .map((a) => String(a.sku ?? a.id ?? ''))
      .filter(Boolean);
    catalog = [...catalog.filter((item) => item.sku !== product.sku), product];
    return product;
  } catch {
    scanLog.unshift({ code, product: '(error)', expected, ms: Date.now() - t0, at: new Date().toISOString() });
    return catalog.find((item) => item.sku === code) ?? null;
  }
}

export function getScanTestLog() {
  return [...scanLog];
}

async function cartLines(): Promise<CartLine[]> {
  if (!floor?.visitToken && !USE_MOCK) return [];
  try {
    const data = await call<unknown>('/cart');
    const rows = Array.isArray(data) ? data : record(data) && Array.isArray(data.lines) ? data.lines : [];
    return rows
      .filter(record)
      .map((row) => {
        const product = toProduct(row, floor?.householdSize || 1);
        if (!product) return null;
        return { product, qty: num(row.qty) || 1 };
      })
      .filter((line): line is CartLine => line !== null);
  } catch {
    return [];
  }
}

export async function getCart(): Promise<CartSnapshot> {
  if (floor?.sessionId && greenGoal === 0) {
    await getRecommendations();
  }
  const lines = await cartLines();
  const great = lines.filter((line) => line.product.verdict === 'green').length;
  const limit = lines.filter((line) => line.product.verdict === 'yellow').length;
  return {
    lines,
    great,
    limit,
    points,
    greensInCart: great,
    greenGoal,
    listComplete: greenGoal > 0 && great >= greenGoal,
  };
}

export async function addToCart(sku: string): Promise<{ added: boolean; product: Product | null }> {
  const known = catalog.find((item) => item.sku === sku) ?? null;
  if (!known?.productId) return { added: false, product: known };
  try {
    await call('/cart/items', {
      method: 'POST',
      body: JSON.stringify({ product_id: known.productId, qty: 1 }),
    });
    if (known.verdict === 'green' && !counted.has(known.productId)) {
      counted.add(known.productId);
      points += 1;
    }
    return { added: true, product: known };
  } catch {
    return { added: false, product: known };
  }
}

export function locationLabel(product: Pick<Product, 'aisle' | 'shelf' | 'bin'>) {
  return `Aisle ${product.aisle} · Shelf ${product.shelf} · Bin ${product.bin}`;
}

export async function getRecipes(): Promise<RecipeCard[]> {
  try {
    const data = await call<Record<string, unknown>>('/recipes/for-me', { visit: false });
    const list = Array.isArray(data.recipes) ? data.recipes.filter(record) : [];
    if (list.length) {
      return list.map((recipe, index) => {
        const nutrition = record(recipe.nutrition_per_serving) ? recipe.nutrition_per_serving : {};
        return {
          id: String(recipe.id ?? index),
          title: String(recipe.title ?? 'Recipe'),
          minutes: num(recipe.time_min ?? recipe.minutes) || 20,
          icon: 'nutrition' as const,
          ingredientSkus: [],
          missingSku: '',
          usesFromCart: Array.isArray(recipe.uses_from_cart) ? recipe.uses_from_cart.length : 0,
          missing: null,
          saved: savedIds.includes(String(recipe.id ?? index)),
          source: String(recipe.source ?? data.source ?? ''),
          why: String(recipe.why_good_for_you ?? ''),
          steps: Array.isArray(recipe.steps) ? recipe.steps.map(String) : [],
          sodiumMg: num(nutrition.sodium_mg),
          sugarG: num(nutrition.sugar_g),
          potassiumMg: num(nutrition.potassium_mg),
          carbsG: num(nutrition.carbs_g),
        };
      }) as RecipeCard[];
    }
  } catch {
    /* offline demo cards */
  }
  const inCart = new Set((await cartLines()).map((line) => line.product.sku));
  return recipes.map((recipe) => ({
    ...recipe,
    usesFromCart: recipe.ingredientSkus.filter((sku) => inCart.has(sku)).length,
    missing: catalog.find((item) => item.sku === recipe.missingSku) ?? null,
    saved: savedIds.includes(recipe.id),
  }));
}

export async function saveRecipe(id: string): Promise<{ saved: boolean; firstSave: boolean }> {
  if (savedIds.includes(id)) return { saved: true, firstSave: false };
  try {
    await call('/recipes/saved', {
      method: 'POST',
      visit: false,
      body: JSON.stringify({ recipe_id: id }),
    });
  } catch {
    /* local save still ok for UX */
  }
  savedIds = [...savedIds, id];
  const firstSave = !recipePointGiven;
  if (firstSave) {
    recipePointGiven = true;
    points += 1;
  }
  return { saved: true, firstSave };
}

export async function getSavedRecipes(): Promise<Recipe[]> {
  return recipes.filter((recipe) => savedIds.includes(recipe.id));
}

export { API_URL };

#!/usr/bin/env node
/**
 * Live API smoke test (Node 22+, built-in fetch).
 * Usage: API_URL=http://187.124.157.140:8010 node scripts/smoke-test.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.API_URL || 'http://187.124.157.140:8010').replace(/\/$/, '');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/integration/smoke-results.json');
const ST_AUG = { lat: 29.8947, lng: -81.3145 };
const FAR = { lat: 40.7128, lng: -74.006 };

const steps = [];
let accessToken = null;
let visitToken = null;
let storeId = null;
let clientId = null;
let email = null;

function pass(name, ok, extra = {}) {
  const row = { name, pass: !!ok, ...extra };
  steps.push(row);
  const tag = ok ? 'PASS' : 'FAIL';
  const bits = [
    `${tag} ${name}`,
    extra.status != null ? `HTTP ${extra.status}` : null,
    extra.ms != null ? `${extra.ms}ms` : null,
    extra.notes || null,
  ].filter(Boolean);
  console.log(bits.join(' | '));
  return row;
}

async function req(method, path, { body, headers } = {}) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(headers || {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  return { status: res.status, ms: Date.now() - t0, json, text };
}

function errCode(json) {
  if (!json || typeof json !== 'object') return null;
  if (json.error && typeof json.error === 'object') return json.error.code || null;
  if (typeof json.error === 'string') return json.error;
  return null;
}

function authHeaders(extra = {}) {
  const h = { ...extra };
  if (accessToken) h.Authorization = `Bearer ${accessToken}`;
  if (visitToken) h['X-Visit-Token'] = visitToken;
  return h;
}

async function step0() {
  const health = await req('GET', '/api/v1/health');
  const ok =
    health.status === 200 &&
    health.json &&
    typeof health.json === 'object' &&
    'db' in health.json;
  pass('0.health', ok, {
    status: health.status,
    ms: health.ms,
    notes: ok ? JSON.stringify(health.json) : String(health.text).slice(0, 120),
  });

  for (const path of ['/api/v1/dev/reset-seed', '/dev/reset-seed']) {
    const r = await req('POST', path, { body: {} });
    pass(`0.reset-seed ${path}`, r.status !== 404, {
      status: r.status,
      ms: r.ms,
      notes: r.status === 404 ? 'MISSING' : JSON.stringify(r.json).slice(0, 160),
    });
  }
}

async function step1() {
  const seedLogin = await req('POST', '/api/v1/auth/login', {
    body: { email: 'maria@demo.local', password: 'nest-local-demo' },
  });
  pass('1.login Maria seed', seedLogin.status === 200, {
    status: seedLogin.status,
    ms: seedLogin.ms,
    notes:
      seedLogin.status === 200
        ? 'seed ok'
        : `seed missing (${errCode(seedLogin.json)}); registering ephemeral Maria-like client`,
  });

  if (seedLogin.status === 200) {
    accessToken = seedLogin.json.access_token;
    email = 'maria@demo.local';
  } else {
    email = `smoke.maria.${Date.now()}@test.local`;
    const reg = await req('POST', '/api/v1/auth/register', {
      body: {
        first_name: 'Maria',
        last_name: 'Alvarez',
        email,
        password: 'nest-local-demo',
        household_size: 3,
        icd10_codes: ['E11.9', 'I10'],
        allergies: [],
      },
    });
    const ok = reg.status === 201 || reg.status === 200;
    pass('1.register Maria-like', ok, {
      status: reg.status,
      ms: reg.ms,
      notes: ok ? email : JSON.stringify(reg.json).slice(0, 200),
    });
    if (ok) accessToken = reg.json.access_token;
  }

  if (!accessToken) {
    pass('1.auth/me', false, { notes: 'no token' });
    return;
  }
  const me = await req('GET', '/api/v1/auth/me', { headers: authHeaders() });
  clientId = me.json?.client?.id || null;
  const hasFlags = me.json?.client?.dm === true && me.json?.client?.htn === true;
  pass('1.auth/me', me.status === 200 && hasFlags, {
    status: me.status,
    ms: me.ms,
    notes:
      me.status === 200
        ? `tier=${me.json?.client?.tier_id} client_code=${me.json?.client?.client_code ?? 'MISSING'}`
        : errCode(me.json),
  });
}

async function step2() {
  if (!accessToken) {
    pass('2.stores', false, { notes: 'skipped' });
    return;
  }
  const q = `lat=${ST_AUG.lat}&lng=${ST_AUG.lng}`;
  const stores = await req('GET', `/api/v1/stores?${q}`, { headers: authHeaders() });
  const list = Array.isArray(stores.json) ? stores.json : stores.json?.stores || [];
  storeId = list[0]?.id || null;
  pass('2.stores near St Augustine', stores.status === 200 && list.length > 0, {
    status: stores.status,
    ms: stores.ms,
    notes: storeId
      ? `${list.length} stores; first=${list[0]?.name}`
      : JSON.stringify(stores.json).slice(0, 160),
  });
  const nearest = await req('GET', `/api/v1/stores/nearest?${q}`, { headers: authHeaders() });
  pass('2.stores/nearest', nearest.status === 200 && nearest.json?.id, {
    status: nearest.status,
    ms: nearest.ms,
    notes: nearest.json?.name || errCode(nearest.json),
  });
}

async function step3() {
  if (!accessToken || !storeId) {
    pass('3.check-in', false, { notes: 'skipped' });
    return;
  }
  const geo = await req('POST', `/api/v1/stores/${storeId}/check-in`, {
    headers: authHeaders(),
    body: { ...ST_AUG, accuracy_m: 5 },
  });
  if (geo.status < 300 && geo.json?.visit_token) visitToken = geo.json.visit_token;
  pass('3.geofence check-in', geo.status < 300 && !!visitToken, {
    status: geo.status,
    ms: geo.ms,
    notes: visitToken
      ? `status=${geo.json?.status}`
      : `${errCode(geo.json)} ${JSON.stringify(geo.json).slice(0, 180)}`,
  });

  const far = await req('POST', `/api/v1/stores/${storeId}/check-in`, {
    headers: authHeaders(),
    body: { ...FAR, accuracy_m: 5 },
  });
  pass('3.NOT_AT_STORE far coords', far.status === 403 && errCode(far.json) === 'NOT_AT_STORE', {
    status: far.status,
    ms: far.ms,
    notes: JSON.stringify(far.json).slice(0, 180),
  });

  const kiosk = await req('POST', '/api/v1/kiosk/check-in', {
    headers: { 'X-Kiosk-Code': process.env.KIOSK_CODE || 'unknown' },
    body: { client_code: '1001' },
  });
  pass('3.kiosk check-in', kiosk.status < 300, {
    status: kiosk.status,
    ms: kiosk.ms,
    notes: kiosk.status < 300 ? 'ok' : `${errCode(kiosk.json)} (need seeded X-Kiosk-Code)`,
  });

  if (clientId) {
    const staff = await req('POST', `/api/v1/stores/${storeId}/check-in/staff`, {
      headers: authHeaders(),
      body: { client_id: clientId },
    });
    pass('3.staff check-in (as client JWT)', staff.status < 300, {
      status: staff.status,
      ms: staff.ms,
      notes: `${errCode(staff.json) || 'ok'} — staff JWT not available (seed empty)`,
    });
  }

  const expired = await req('POST', '/api/v1/auth/login', {
    body: { email: 'helen@demo.local', password: 'nest-local-demo' },
  });
  pass('3.expired persona helen seed', expired.status === 200 || expired.status === 403, {
    status: expired.status,
    ms: expired.ms,
    notes: expired.status === 401 ? 'MISSING seed persona' : JSON.stringify(expired.json).slice(0, 120),
  });
}

async function step4() {
  const r = await req('GET', '/api/v1/recommendations', { headers: authHeaders() });
  const products = r.json?.products || r.json?.items || (Array.isArray(r.json) ? r.json : null);
  pass('4.recommendations', r.status === 200 && Array.isArray(products), {
    status: r.status,
    ms: r.ms,
    notes: r.status === 200 ? `n=${products.length}` : `${errCode(r.json)}`,
  });
}

async function step5() {
  const barcodes = await req('GET', '/api/v1/dev/barcodes');
  pass('5.dev/barcodes', barcodes.status === 200, {
    status: barcodes.status,
    ms: barcodes.ms,
    notes: barcodes.status === 404 ? 'MISSING' : JSON.stringify(barcodes.json).slice(0, 160),
  });
  const codes = barcodes.status === 200
    ? (Array.isArray(barcodes.json) ? barcodes.json : barcodes.json?.barcodes || [])
    : [
        { code: 'SOUP', expected_level: 'red' },
        { code: 'BEANS', expected_level: 'green' },
        { code: '00041196419429' },
        { code: 'junk-xyz' },
        { code: '041196419429' },
      ];
  for (const row of codes) {
    const code = row.code || row.barcode || row.sku;
    const expected = row.expected_level || row.expected_color || row.color;
    const scan = await req('POST', '/api/v1/scan', {
      headers: authHeaders(),
      body: { code, source: 'manual' },
    });
    const actual = scan.json?.status?.level || scan.json?.verdict;
    pass(`5.scan ${code}`, scan.status === 200 && (!expected || actual === expected), {
      status: scan.status,
      ms: scan.ms,
      notes: scan.status === 200
        ? `expected=${expected ?? 'n/a'} actual=${actual}`
        : errCode(scan.json),
    });
  }
}

async function step6() {
  const cart = await req('GET', '/api/v1/cart', { headers: authHeaders() });
  pass('6.cart get', cart.status === 200, {
    status: cart.status,
    ms: cart.ms,
    notes: errCode(cart.json) || JSON.stringify(cart.json).slice(0, 160),
  });
  pass('6.cart add green/yellow/red', false, {
    notes: 'blocked — no visit token / no product ids from scan',
  });
}

async function step7() {
  const forMe = await req('GET', '/api/v1/recipes/for-me', { headers: authHeaders() });
  pass('7.recipes/for-me', forMe.status === 200, {
    status: forMe.status,
    ms: forMe.ms,
    notes: forMe.status === 200
      ? `source=${forMe.json?.source} n=${forMe.json?.recipes?.length}`
      : `${errCode(forMe.json)} (OpenAPI requires session_id query)`,
  });
  const fromCart = await req('POST', '/api/v1/recipes/from-cart', {
    headers: authHeaders(),
    body: {},
  });
  pass('7.recipes/from-cart', fromCart.status === 200, {
    status: fromCart.status,
    ms: fromCart.ms,
    notes: errCode(fromCart.json) || `source=${fromCart.json?.source}`,
  });
  const saved = await req('GET', '/api/v1/recipes/saved', { headers: authHeaders() });
  pass('7.recipes/saved', saved.status === 200, {
    status: saved.status,
    ms: saved.ms,
    notes: errCode(saved.json) || 'ok',
  });
}

async function step8() {
  if (!visitToken) {
    pass('8.checkout', false, { notes: 'no visit_token — check-in failed' });
    return;
  }
  const validate = await req('POST', `/api/v1/checkout/${visitToken}/validate`, {
    headers: authHeaders(),
    body: { codes: ['SOUP'] },
  });
  pass('8.checkout validate RED', validate.status === 409, {
    status: validate.status,
    ms: validate.ms,
    notes: errCode(validate.json) || JSON.stringify(validate.json).slice(0, 160),
  });
}

async function step9() {
  const staffLogin = await req('POST', '/api/v1/auth/login', {
    body: { email: 'staff@demo.local', password: 'nest-local-demo' },
  });
  pass('9.staff login', staffLogin.status === 200, {
    status: staffLogin.status,
    ms: staffLogin.ms,
    notes: staffLogin.status === 200 ? 'ok' : 'MISSING seed staff',
  });
  const token = staffLogin.status === 200 ? staffLogin.json.access_token : null;
  for (const path of [
    '/api/v1/inventory',
    '/api/v1/inventory/alerts',
    '/api/v1/inventory/restock-route',
    '/api/v1/floor/status',
  ]) {
    const r = await req('GET', path, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    pass(`9.${path}`, r.status === 200, {
      status: r.status,
      ms: r.ms,
      notes: r.status === 404 ? 'MISSING' : errCode(r.json) || 'ok',
    });
  }
}

async function step10() {
  const adminLogin = await req('POST', '/api/v1/auth/login', {
    body: { email: 'admin@demo.local', password: 'nest-local-demo' },
  });
  pass('10.admin login', adminLogin.status === 200, {
    status: adminLogin.status,
    ms: adminLogin.ms,
    notes: adminLogin.status === 200 ? 'ok' : 'MISSING seed admin',
  });
  const paths = [
    '/api/v1/analytics/summary',
    '/api/v1/analytics/trends',
    '/api/v1/analytics/distribution',
    '/api/v1/analytics/insights',
    '/api/v1/reports/grants.csv',
    '/api/v1/rules',
    '/api/v1/ai/logs',
    '/api/v1/recipes/eval-report',
  ];
  for (const path of paths) {
    const r = await req('GET', path, {
      headers:
        adminLogin.status === 200
          ? { Authorization: `Bearer ${adminLogin.json.access_token}` }
          : {},
    });
    pass(`10.${path}`, r.status === 200, {
      status: r.status,
      ms: r.ms,
      notes: r.status === 404 ? 'MISSING' : errCode(r.json) || 'ok',
    });
  }
}

async function main() {
  console.log(`API_URL=${BASE}`);
  const startedAt = new Date().toISOString();
  await step0();
  await step1();
  await step2();
  await step3();
  await step4();
  await step5();
  await step6();
  await step7();
  await step8();
  await step9();
  await step10();

  const passed = steps.filter((s) => s.pass).length;
  const failed = steps.length - passed;
  const result = {
    baseUrl: BASE,
    startedAt,
    finishedAt: new Date().toISOString(),
    email,
    storeId,
    visitTokenPresent: !!visitToken,
    summary: { passed, failed, total: steps.length },
    steps,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(`\n${passed}/${steps.length} PASS — wrote ${OUT}`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

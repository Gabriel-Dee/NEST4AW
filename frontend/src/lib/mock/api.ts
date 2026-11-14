import { CATALOG, getProductByCode } from "@/lib/mock/catalog";
import {
  CLIENTS,
  TIER_LABELS,
  findClientByToken,
} from "@/lib/mock/clients";
import { RULES } from "@/lib/mock/rules";
import type {
  AnalyticsKpis,
  AnalyticsPoint,
  AuthUser,
  FloorArriveResult,
  Role,
  ScanResult,
  Verdict,
} from "@/lib/types";

const DEMO_USERS: Record<string, { password: string; user: AuthUser }> = {
  "staff@demo.local": {
    password: "nest-local-demo",
    user: {
      id: "u-staff",
      email: "staff@demo.local",
      role: "warehouse_staff",
      displayName: "Jordan Lee",
    },
  },
  "doctor@demo.local": {
    password: "nest-local-demo",
    user: {
      id: "u-doctor",
      email: "doctor@demo.local",
      role: "doctor",
      displayName: "Dr. Sam Rivera",
    },
  },
  "admin@demo.local": {
    password: "nest-local-demo",
    user: {
      id: "u-admin",
      email: "admin@demo.local",
      role: "admin",
      displayName: "Alex Morgan",
    },
  },
  "partner@demo.local": {
    password: "nest-local-demo",
    user: {
      id: "u-partner",
      email: "partner@demo.local",
      role: "community_partner",
      displayName: "Grant Partner",
    },
  },
};

let floorCount = 18;
const floorCap = 25;
let queueLength = 2;

function delay(ms = 280) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Mock API layer. Verdicts are attached here as if from the backend.
 * UI components must only paint `verdict` — never derive color from nutrients.
 */
export const mockApi = {
  async login(email: string, password: string): Promise<AuthUser> {
    await delay();
    const row = DEMO_USERS[email.trim().toLowerCase()];
    if (!row || row.password !== password) {
      throw new Error("invalid email or password");
    }
    return { ...row.user };
  },

  async floorArrive(token: string): Promise<FloorArriveResult> {
    await delay(400);
    const client = findClientByToken(token);
    if (!client) {
      throw Object.assign(new Error("please see a volunteer"), { status: 401 });
    }
    if (client.enrollment_status === "expired") {
      return {
        session_id: "",
        status: "queued",
        tier_id: client.tier,
        household_size: client.household_size,
        enrollment_expired: true,
        first_name: client.first_name,
        diet_label: TIER_LABELS[client.tier],
      };
    }
    if (floorCount >= floorCap) {
      queueLength += 1;
      return {
        session_id: `sess-q-${client.id}`,
        status: "queued",
        tier_id: client.tier,
        household_size: client.household_size,
        queue_position: queueLength,
        eta_minutes: queueLength * 2,
        first_name: client.first_name,
        diet_label: TIER_LABELS[client.tier],
      };
    }
    floorCount += 1;
    return {
      session_id: `sess-${client.id}-${Date.now()}`,
      status: "active",
      tier_id: client.tier,
      household_size: client.household_size,
      first_name: client.first_name,
      diet_label: TIER_LABELS[client.tier],
    };
  },

  async scan(
    sessionId: string,
    code: string,
    clientKey?: string,
  ): Promise<ScanResult> {
    await delay(200);
    void sessionId;
    const product = getProductByCode(code);
    if (!product) {
      return { verdict: "unknown", reasons: [], product: null };
    }

    const client =
      CLIENTS.find((c) => c.key === clientKey) ??
      CLIENTS.find((c) => sessionId.includes(c.id)) ??
      CLIENTS[0];

    // Mock server engine only — UI must not recompute verdicts.
    let verdict: Verdict = "green";
    const reasons: ScanResult["reasons"] = [];
    let cap_limit: number | undefined;

    if (
      product.allergens.some((a) =>
        client.allergens.map((x) => x.toLowerCase()).includes(a.toLowerCase()),
      )
    ) {
      verdict = "red";
      reasons.push({
        rule_id: "ALLERGEN",
        source: "FDA major allergens",
        message: `Contains ${product.allergens.join(", ")} — restricted for this profile`,
      });
    } else if (
      product.is_drink &&
      (product.added_sugar_g ?? 0) >= 0.5 &&
      client.dm
    ) {
      verdict = "red";
      reasons.push({
        rule_id: "SUG_DRINK",
        source: "ADA 2025 rec 5.25",
        message: "Sweetened drink restricted for diabetes tier",
      });
    } else if (
      (product.sodium_mg ?? 0) >= 460 &&
      (client.dm || client.htn || client.ckd34)
    ) {
      verdict = "red";
      reasons.push({
        rule_id: "NA_HIGH",
        source: "Pantry sodium band",
        message: `Contains ${product.sodium_mg}mg sodium — restricted for CKD/HTN/DM`,
      });
    } else if (
      client.k_limit_ordered &&
      client.ckd34 &&
      (product.potassium_mg ?? 0) >= 200
    ) {
      verdict = "red";
      reasons.push({
        rule_id: "K_LIMIT",
        source: "Clinic potassium order",
        message: `Contains ${product.potassium_mg}mg potassium — restricted by order`,
      });
    } else if (
      (product.sodium_mg ?? 0) >= 141 &&
      (client.dm || client.htn || client.ckd34)
    ) {
      verdict = "yellow";
      cap_limit = 2;
      reasons.push({
        rule_id: "NA_MID",
        source: "Pantry sodium band",
        message: `Moderate sodium — capped at ${cap_limit}`,
      });
    }

    return { verdict, reasons, product, cap_limit };
  },

  async checkout(sessionId: string, lines: { verdict: Verdict }[]) {
    await delay(350);
    void sessionId;
    if (lines.some((l) => l.verdict === "red" || l.verdict === "unknown")) {
      throw Object.assign(
        new Error("Checkout paused — restricted item in cart"),
        { code: "red_in_cart" },
      );
    }
    floorCount = Math.max(0, floorCount - 1);
    return { ok: true as const, message: "Inventory updated" };
  },

  getFloorBoard() {
    return { on_floor: floorCount, cap: floorCap, queue: queueLength };
  },

  getCatalog() {
    return CATALOG;
  },

  getClients() {
    return CLIENTS;
  },

  getRules() {
    return RULES;
  },

  async getAnalytics(): Promise<{
    kpis: AnalyticsKpis;
    trend3: AnalyticsPoint[];
    trend6: AnalyticsPoint[];
    byCondition: AnalyticsPoint[];
  }> {
    await delay(500);
    return {
      kpis: {
        clients_served: 412,
        pounds_distributed: 18420,
        green_pct: 78,
      },
      trend3: [
        { label: "Sep", value: 5200 },
        { label: "Oct", value: 6100 },
        { label: "Nov", value: 7120 },
      ],
      trend6: [
        { label: "Jun", value: 4100 },
        { label: "Jul", value: 4400 },
        { label: "Aug", value: 4800 },
        { label: "Sep", value: 5200 },
        { label: "Oct", value: 6100 },
        { label: "Nov", value: 7120 },
      ],
      byCondition: [
        { label: "Diabetes", value: 6200 },
        { label: "Hypertension", value: 5100 },
        { label: "CKD 3–4", value: 3900 },
        { label: "Combined tiers", value: 3220 },
      ],
    };
  },

  roleHome(role: Role): string {
    switch (role) {
      case "warehouse_staff":
        return "/checkout";
      case "doctor":
        return "/admin/clinical";
      case "admin":
        return "/admin";
      case "community_partner":
        return "/admin/analytics";
      default:
        return "/kiosk";
    }
  },
};

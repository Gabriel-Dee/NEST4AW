"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ALLERGENS,
  createClient,
  listClients,
  patchClient,
  revokeToken,
  type ClientRecord,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

const ICD_PRESETS = ["E11.9", "I10", "N18.3", "N18.4"];
const ICD_LABEL: Record<string, string> = {
  "E11.9": "Type 2 diabetes",
  I10: "High blood pressure",
  "N18.3": "Kidney disease, stage 3",
  "N18.4": "Kidney disease, stage 4",
};
const icdText = (code: string) => (ICD_LABEL[code] ? `${ICD_LABEL[code]} (${code})` : code);
const pretty = (code: string) => code.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const empty = {
  legal_name: "",
  phone: "",
  email: "",
  password: "",
  household_size: 1,
  icd10: [] as string[],
  allergens: [] as string[],
  k_limit_ordered: false,
};

export default function ClinicalPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ClientRecord[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [icd, setIcd] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [tokenOnce, setTokenOnce] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || (user.role !== "doctor" && user.role !== "admin")) return;
    listClients()
      .then(setRows)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load clients"));
  }, [user]);

  function addIcd(code: string) {
    const next = code.trim().toUpperCase();
    if (!next) return;
    setForm((prev) => ({
      ...prev,
      icd10: prev.icd10.includes(next) ? prev.icd10 : [...prev.icd10, next],
    }));
    setIcd("");
  }

  function toggleAllergen(code: string) {
    setForm((prev) => ({
      ...prev,
      allergens: prev.allergens.includes(code)
        ? prev.allergens.filter((item) => item !== code)
        : [...prev.allergens, code],
    }));
  }

  async function reload() {
    setRows(await listClients());
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setTokenOnce(null);
    try {
      if (editing) {
        const saved = await patchClient(editing, {
          phone: form.phone,
          household_size: form.household_size,
          icd10: form.icd10,
          allergens: form.allergens,
          k_limit_ordered: form.k_limit_ordered,
        });
        setWarnings(saved.warnings ?? []);
        toast.success(`Server tier ${saved.tier_id}`);
      } else {
        const saved = await createClient({
          legal_name: form.legal_name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          password: form.password,
          household_size: form.household_size,
          icd10: form.icd10,
          allergens: form.allergens,
          k_limit_ordered: form.k_limit_ordered,
        });
        setTokenOnce(saved.card_token ?? null);
        setWarnings(saved.warnings ?? []);
        toast.success(`Enrolled. Server tier ${saved.tier_id}`);
        setForm(empty);
      }
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function edit(row: ClientRecord) {
    setEditing(row.id);
    setTokenOnce(null);
    setForm({
      legal_name: row.legal_name,
      phone: row.phone,
      email: row.email,
      password: "",
      household_size: row.household_size,
      icd10: row.icd10,
      allergens: row.allergens.filter((code) => (ALLERGENS as readonly string[]).includes(code)),
      k_limit_ordered: row.k_limit_ordered,
    });
  }

  async function revoke(id: string) {
    setBusy(true);
    try {
      await revokeToken(id);
      await reload();
      toast.success("Token revoked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-muted-foreground">
        Enter the client&apos;s diagnoses and allergies. The diet tier is assigned automatically from the
        diagnoses, and the client&apos;s check-in card code is shown once after enrolling.
      </p>

      {tokenOnce ? (
        <Alert>
          <AlertTitle>Card token</AlertTitle>
          <AlertDescription className="space-y-2">
            <p className="font-mono text-sm break-all">{tokenOnce}</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(tokenOnce)}>
                Copy
              </Button>
              <Button type="button" variant="ghost" onClick={() => setTokenOnce(null)}>
                Hide
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {warnings.length > 0 ? (
        <Alert>
          <AlertTitle>Server warnings</AlertTitle>
          <AlertDescription>{warnings.join(" ")}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <form className="space-y-6" onSubmit={onSubmit}>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>1 · {editing ? "Edit client" : "Client details"}</CardTitle>
            <CardDescription>Name and phone are encrypted at rest.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="legal-name">Legal name</Label>
              <Input
                id="legal-name"
                value={form.legal_name}
                onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
                required={!editing}
                disabled={!!editing}
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required={!editing}
                disabled={!!editing}
                className="h-10 rounded-xl"
              />
            </div>
            {editing ? null : (
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  className="h-10 rounded-xl"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="household">Household size</Label>
              <Input
                id="household"
                type="number"
                min={1}
                max={100}
                value={form.household_size}
                onChange={(e) =>
                  setForm({ ...form, household_size: Math.max(1, Number(e.target.value) || 1) })
                }
                className="h-10 rounded-xl"
              />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox
                checked={form.k_limit_ordered}
                onCheckedChange={(value) => setForm({ ...form, k_limit_ordered: value === true })}
              />
              Potassium limit ordered
            </label>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-lg">2 · Diagnoses (ICD-10)</CardTitle>
            <CardDescription>Pick common ones or type a code. These set the diet tier.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {ICD_PRESETS.map((code) => (
                <Button key={code} type="button" size="sm" variant="outline" className="rounded-full" onClick={() => addIcd(code)}>
                  + {icdText(code)}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={icd}
                onChange={(e) => setIcd(e.target.value)}
                placeholder="Add ICD-10 code"
                className="h-10 rounded-xl"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addIcd(icd);
                  }
                }}
              />
              <Button type="button" variant="secondary" className="rounded-xl" onClick={() => addIcd(icd)}>
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {form.icd10.map((code) => (
                <Badge key={code} variant="secondary" className="rounded-full py-1 text-sm">
                  {icdText(code)}
                  <button
                    type="button"
                    className="ml-1"
                    aria-label={`Remove ${code}`}
                    onClick={() => setForm({ ...form, icd10: form.icd10.filter((item) => item !== code) })}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-lg">3 · Allergies</CardTitle>
            <CardDescription>Foods with these allergens always show red for this client.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {ALLERGENS.map((code) => (
              <Button
                key={code}
                type="button"
                size="sm"
                variant={form.allergens.includes(code) ? "default" : "outline"}
                className="rounded-full"
                onClick={() => toggleAllergen(code)}
              >
                {pretty(code)}
              </Button>
            ))}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" size="lg" className="rounded-xl" disabled={busy}>
            {editing ? "Save changes" : "Enroll"}
          </Button>
          {editing ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                setEditing(null);
                setForm(empty);
              }}
            >
              New client
            </Button>
          ) : null}
        </div>
      </form>

      <Card className="rounded-2xl xl:sticky xl:top-24">
        <CardHeader className="space-y-3">
          <CardTitle className="flex items-center justify-between text-lg">
            Clients <span className="text-sm font-normal text-muted-foreground">{rows.length}</span>
          </CardTitle>
          <Input value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} placeholder="Search by name" aria-label="Search clients" className="h-10 rounded-xl" />
        </CardHeader>
        <CardContent className="max-h-[70vh] space-y-3 overflow-y-auto">
          {rows.length === 0 ? <p className="text-sm text-muted-foreground">No clients yet.</p> : null}
          {rows.filter((row) => String(row.legal_name ?? "").toLowerCase().includes(clientQuery.toLowerCase())).map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-3">
              <div>
                <p className="font-medium">{row.legal_name}</p>
                <p className="text-sm text-muted-foreground">
                  Tier {row.tier_id} · household of {row.household_size} ·{" "}
                  <span className={row.token_status === "active" ? "text-emerald-700" : "text-destructive"}>card {row.token_status}</span>
                </p>
                <p className="text-sm">
                  {[row.dm ? "Diabetes" : null, row.htn ? "High blood pressure" : null, row.ckd34 ? "Kidney disease 3–4" : null]
                    .filter(Boolean)
                    .join(" · ") || "No conditions"}
                  {row.k_limit_ordered ? " · Potassium limit" : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => edit(row)}>
                  Edit
                </Button>
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => revoke(row.id)} disabled={busy}>
                  Revoke token
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

"use client";

import { AppShell } from "@/components/layout/app-shell";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TIER_LABELS } from "@/lib/mock/clients";
import type { TierId } from "@/lib/types";
import { ChevronsUpDown, Lock, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

const ICD10_OPTIONS = [
  { code: "E11", label: "E11 Type 2 Diabetes" },
  { code: "E11.9", label: "E11.9 Type 2 DM without complications" },
  { code: "I10", label: "I10 Hypertension" },
  { code: "N18.3", label: "N18.3 CKD Stage 3" },
  { code: "N18.32", label: "N18.32 CKD Stage 3b" },
  { code: "N18.4", label: "N18.4 CKD Stage 4" },
] as const;

const ALLERGEN_PRESETS = [
  "milk",
  "eggs",
  "peanuts",
  "tree nuts",
  "wheat",
  "soy",
  "fish",
  "shellfish",
  "sesame",
] as const;

function deriveProposedTier(flags: {
  dm: boolean;
  htn: boolean;
  ckd34: boolean;
}): TierId | null {
  const { dm, htn, ckd34 } = flags;
  if (dm && htn && ckd34) return "T7";
  if (htn && ckd34) return "T6";
  if (dm && ckd34) return "T5";
  if (dm && htn) return "T4";
  if (ckd34) return "T3";
  if (htn) return "T2";
  if (dm) return "T1";
  return null;
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "•••";
  return `•••-•••-${digits.slice(-4)}`;
}

function PhiLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <Label htmlFor={htmlFor} className="flex items-center gap-1.5">
      {children}
      <Lock className="size-3.5 text-muted-foreground" aria-hidden />
      <span className="text-xs text-muted-foreground">Encrypted</span>
    </Label>
  );
}

export default function ClinicalIntakePage() {
  const [legalName, setLegalName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [household, setHousehold] = useState(1);
  const [icd10, setIcd10] = useState<string[]>([]);
  const [allergens, setAllergens] = useState<string[]>([]);
  const [allergenInput, setAllergenInput] = useState("");
  const [dm, setDm] = useState(false);
  const [htn, setHtn] = useState(false);
  const [ckd34, setCkd34] = useState(false);
  const [maskPhoneDisplay, setMaskPhoneDisplay] = useState(true);
  const [icdOpen, setIcdOpen] = useState(false);

  const proposed = useMemo(
    () => deriveProposedTier({ dm, htn, ckd34 }),
    [dm, htn, ckd34],
  );

  function addIcd(code: string) {
    setIcd10((prev) => (prev.includes(code) ? prev : [...prev, code]));
    if (code.startsWith("E11")) setDm(true);
    if (code === "I10") setHtn(true);
    if (code.startsWith("N18")) setCkd34(true);
    setIcdOpen(false);
  }

  function addAllergen(raw: string) {
    const a = raw.trim().toLowerCase();
    if (!a) return;
    setAllergens((prev) => (prev.includes(a) ? prev : [...prev, a]));
    setAllergenInput("");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Clinical profile intake
          </h1>
          <p className="text-sm text-muted-foreground">
            Capture diagnoses and allergies. Proposed tier is a display preview
            only — server assignment is authoritative.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-6">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg">Client info</CardTitle>
              <CardDescription>
                PHI fields are marked Encrypted for demo UX.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <PhiLabel htmlFor="legal-name">Legal name</PhiLabel>
                <Input
                  id="legal-name"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  className="h-10 rounded-xl"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <PhiLabel htmlFor="phone">Phone</PhiLabel>
                <Input
                  id="phone"
                  type="tel"
                  value={maskPhoneDisplay && phone ? maskPhone(phone) : phone}
                  onChange={(e) => {
                    if (maskPhoneDisplay) return;
                    setPhone(e.target.value);
                  }}
                  onFocus={() => setMaskPhoneDisplay(false)}
                  className="h-10 rounded-xl"
                  autoComplete="off"
                />
                <div className="flex items-center gap-2 pt-1">
                  <Checkbox
                    id="mask-phone"
                    checked={maskPhoneDisplay}
                    onCheckedChange={(v) => setMaskPhoneDisplay(!!v)}
                  />
                  <Label htmlFor="mask-phone" className="text-xs font-normal">
                    Masked phone display
                  </Label>
                </div>
              </div>
              <div className="space-y-1.5">
                <PhiLabel htmlFor="email">Email</PhiLabel>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 rounded-xl"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="household">Household size</Label>
                <Input
                  id="household"
                  type="number"
                  min={1}
                  max={20}
                  value={household}
                  onChange={(e) =>
                    setHousehold(Math.max(1, Number(e.target.value) || 1))
                  }
                  className="h-10 rounded-xl"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg">ICD-10</CardTitle>
              <CardDescription>
                Searchable picker — examples include E11, I10, N18.3
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Popover open={icdOpen} onOpenChange={setIcdOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-between rounded-xl"
                    />
                  }
                >
                  Add ICD-10 code
                  <ChevronsUpDown className="size-4 opacity-50" />
                </PopoverTrigger>
                <PopoverContent
                  className="w-[min(100vw-2rem,22rem)] p-0"
                  align="start"
                >
                  <Command>
                    <CommandInput placeholder="Search ICD-10…" />
                    <CommandList>
                      <CommandEmpty>No code found</CommandEmpty>
                      <CommandGroup>
                        {ICD10_OPTIONS.map((opt) => (
                          <CommandItem
                            key={opt.code}
                            value={opt.label}
                            data-checked={
                              icd10.includes(opt.code) || undefined
                            }
                            onSelect={() => addIcd(opt.code)}
                          >
                            {opt.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <div className="flex flex-wrap gap-2">
                {icd10.map((code) => (
                  <Badge
                    key={code}
                    variant="secondary"
                    className="gap-1 rounded-full pr-1"
                  >
                    {code}
                    <button
                      type="button"
                      className="rounded-full p-0.5 hover:bg-muted"
                      aria-label={`Remove ${code}`}
                      onClick={() =>
                        setIcd10((prev) => prev.filter((c) => c !== code))
                      }
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap gap-4 border-t pt-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={dm}
                    onCheckedChange={(v) => setDm(!!v)}
                  />
                  Diabetes (DM)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={htn}
                    onCheckedChange={(v) => setHtn(!!v)}
                  />
                  Hypertension (HTN)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={ckd34}
                    onCheckedChange={(v) => setCkd34(!!v)}
                  />
                  CKD 3–4
                </label>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg">Allergies</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {ALLERGEN_PRESETS.map((a) => (
                  <Button
                    key={a}
                    type="button"
                    size="sm"
                    variant={allergens.includes(a) ? "default" : "outline"}
                    className="rounded-full"
                    onClick={() =>
                      setAllergens((prev) =>
                        prev.includes(a)
                          ? prev.filter((x) => x !== a)
                          : [...prev, a],
                      )
                    }
                  >
                    {a}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add allergy chip…"
                  value={allergenInput}
                  onChange={(e) => setAllergenInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addAllergen(allergenInput);
                    }
                  }}
                  className="h-10 rounded-xl"
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-xl"
                  onClick={() => addAllergen(allergenInput)}
                >
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {allergens.map((a) => (
                  <Badge
                    key={a}
                    variant="secondary"
                    className="gap-1 rounded-full pr-1"
                  >
                    {a}
                    <button
                      type="button"
                      className="rounded-full p-0.5 hover:bg-muted"
                      aria-label={`Remove ${a}`}
                      onClick={() =>
                        setAllergens((prev) => prev.filter((x) => x !== a))
                      }
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-primary/30 bg-muted/20">
            <CardHeader>
              <CardTitle className="text-lg">Proposed diet tier</CardTitle>
              <CardDescription>
                Intake UX preview from condition flags — not a signed assignment
              </CardDescription>
            </CardHeader>
            <CardContent>
              {proposed ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Badge className="rounded-full px-3 py-1 text-sm">
                    {proposed}
                  </Badge>
                  <p className="text-sm font-medium">{TIER_LABELS[proposed]}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select ICD-10 / flags to preview T1–T7
                </p>
              )}
            </CardContent>
          </Card>

          <Button type="submit" className="rounded-xl">
            Save intake (demo)
          </Button>
        </form>
      </div>
    </AppShell>
  );
}

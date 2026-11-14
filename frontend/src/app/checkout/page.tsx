"use client";

import { VerdictBadge } from "@/components/status/verdict-badge";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { mockApi } from "@/lib/mock/api";
import { CLIENTS, TIER_LABELS } from "@/lib/mock/clients";
import type { CartLine, ClientProfile, Product, Verdict } from "@/lib/types";
import { Ban, CheckCircle2, ScanLine } from "lucide-react";
import { FormEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type Blocked = {
  product: Product | null;
  verdict: Verdict;
  message: string;
  swaps: { id: string; name: string; location: string }[];
};

type Receipt = {
  lines: CartLine[];
  totalLb: number;
  message: string;
};

export default function CheckoutPage() {
  const [clientKey, setClientKey] = useState(CLIENTS[0]?.key ?? "maria");
  const [sessionId, setSessionId] = useState(
    () => `sess-checkout-${Date.now()}`,
  );
  const [scanCode, setScanCode] = useState("");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [scanning, setScanning] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const client: ClientProfile =
    CLIENTS.find((c) => c.key === clientKey) ?? CLIENTS[0];

  const conditionChips = useMemo(() => {
    const chips = [...client.icd10];
    for (const a of client.allergens) chips.push(`Allergen: ${a}`);
    return chips;
  }, [client]);

  const totals = useMemo(() => {
    const items = lines.reduce((n, l) => n + l.quantity, 0);
    const lb = lines.reduce(
      (n, l) => n + l.product.weight_lb * l.quantity,
      0,
    );
    return { items, lb: Number(lb.toFixed(2)) };
  }, [lines]);

  const hardLocked = blocked != null;
  const canCheckout =
    !hardLocked && lines.length > 0 && !checkingOut && !receipt;

  function onClientChange(key: string | null) {
    if (!key) return;
    setClientKey(key);
    setLines([]);
    setBlocked(null);
    setReceipt(null);
    setSessionId(`sess-checkout-${key}-${Date.now()}`);
    setScanCode("");
  }

  async function onScan(e?: FormEvent) {
    e?.preventDefault();
    const code = scanCode.trim();
    if (!code || scanning || hardLocked || receipt) return;

    setScanning(true);
    try {
      const result = await mockApi.scan(sessionId, code, client.key);
      if (result.verdict === "red" || result.verdict === "unknown") {
        setBlocked({
          product: result.product,
          verdict: result.verdict,
          message:
            result.reasons[0]?.message ??
            (result.verdict === "unknown"
              ? "Unknown item — blocked until identified"
              : "Restricted for this profile"),
          swaps: result.product?.swap_suggestions ?? [],
        });
        setScanCode("");
        return;
      }

      if (!result.product) {
        toast.error("No product returned");
        return;
      }

      setLines((prev) => {
        const idx = prev.findIndex(
          (l) =>
            l.product.id === result.product!.id &&
            l.verdict === result.verdict,
        );
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            quantity: next[idx].quantity + 1,
          };
          return next;
        }
        return [
          ...prev,
          {
            product: result.product!,
            verdict: result.verdict,
            reasons: result.reasons,
            quantity: 1,
          },
        ];
      });
      setScanCode("");
      inputRef.current?.focus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  function clearBlock(mode: "removed" | "swap") {
    setBlocked(null);
    setScanCode("");
    toast.message(
      mode === "removed" ? "Item removed from bag" : "Ready to scan swap",
    );
    inputRef.current?.focus();
  }

  async function completeCheckout() {
    if (!canCheckout) return;
    setCheckingOut(true);
    try {
      const res = await mockApi.checkout(
        sessionId,
        lines.map((l) => ({ verdict: l.verdict })),
      );
      setReceipt({
        lines,
        totalLb: totals.lb,
        message: res.message,
      });
      toast.success(res.message);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Checkout could not complete",
      );
    } finally {
      setCheckingOut(false);
    }
  }

  function startNew() {
    setLines([]);
    setBlocked(null);
    setReceipt(null);
    setScanCode("");
    setSessionId(`sess-checkout-${client.key}-${Date.now()}`);
    inputRef.current?.focus();
  }

  if (receipt) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Card className="rounded-2xl">
          <CardHeader>
            <div className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="size-6" />
              <CardTitle>Checkout complete</CardTitle>
            </div>
            <CardDescription>
              {client.legal_name} · {receipt.message}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="divide-y rounded-xl border">
              {receipt.lines.map((line) => (
                <li
                  key={`${line.product.id}-${line.verdict}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <span>
                    {line.product.name}
                    {line.quantity > 1 ? ` ×${line.quantity}` : ""}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {(line.product.weight_lb * line.quantity).toFixed(2)} lb
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between text-base font-medium">
              <span>Total pounds</span>
              <span className="tabular-nums">{receipt.totalLb} lb</span>
            </div>
            <p className="text-sm text-muted-foreground">Inventory updated</p>
            <Button className="rounded-xl" onClick={startNew}>
              New checkout
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative space-y-4">
      {hardLocked ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-6 pt-24">
          <Alert
            variant="destructive"
            className="max-w-xl border-destructive bg-card shadow-lg"
          >
            <Ban className="size-5" />
            <AlertTitle className="text-lg">
              Checkout paused – 1 restricted item
            </AlertTitle>
            <AlertDescription className="mt-2 space-y-4">
              <div>
                <p className="font-medium text-foreground">
                  {blocked.product?.name ?? "Unknown product"}
                </p>
                <p>{blocked.message}</p>
              </div>
              {blocked.swaps.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Swap suggestions
                  </p>
                  <ul className="space-y-1.5">
                    {blocked.swaps.map((s) => (
                      <li
                        key={s.id}
                        className="rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
                      >
                        <span className="font-medium">{s.name}</span>
                        <span className="block text-muted-foreground">
                          {s.location}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => clearBlock("removed")}
                >
                  Item removed
                </Button>
                <Button
                  className="rounded-xl"
                  onClick={() => clearBlock("swap")}
                >
                  Swap item
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Client session</CardTitle>
            <CardDescription>Volunteer terminal</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={clientKey} onValueChange={onClientChange}>
                <SelectTrigger className="h-10 w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIENTS.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.legal_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-sm font-medium">{client.legal_name}</p>
              <Badge className="mt-2 rounded-full" variant="secondary">
                {TIER_LABELS[client.tier]}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {conditionChips.map((chip) => (
                <Badge
                  key={chip}
                  variant="outline"
                  className="rounded-full text-xs"
                >
                  {chip}
                </Badge>
              ))}
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground break-all">
              Session {sessionId}
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ScanLine className="size-4" />
                Scan items
              </CardTitle>
              <CardDescription>
                Use barcode or internal code (e.g. A-001). Verdicts come from
                the API only.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="flex gap-2" onSubmit={onScan}>
                <Input
                  ref={inputRef}
                  value={scanCode}
                  onChange={(e) => setScanCode(e.target.value)}
                  placeholder="Scan or type product code"
                  className="h-11 flex-1 rounded-xl"
                  disabled={hardLocked || scanning}
                  autoFocus
                />
                <Button
                  type="submit"
                  className="h-11 rounded-xl"
                  disabled={!scanCode.trim() || hardLocked || scanning}
                >
                  {scanning ? "…" : "Add"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Bag</CardTitle>
              <p className="text-sm text-muted-foreground tabular-nums">
                {totals.items} items · {totals.lb} lb
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {lines.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No items yet — scan to add.
                </p>
              ) : (
                <ul className="divide-y rounded-xl border">
                  {lines.map((line) => (
                    <li
                      key={`${line.product.id}-${line.verdict}`}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">
                          {line.product.name}
                          {line.quantity > 1 ? (
                            <span className="text-muted-foreground">
                              {" "}
                              ×{line.quantity}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {line.product.internal_code} · aisle{" "}
                          {line.product.aisle}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {(line.product.weight_lb * line.quantity).toFixed(2)}{" "}
                          lb
                        </span>
                        <VerdictBadge verdict={line.verdict} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex justify-end pt-2">
                <Button
                  className="rounded-xl"
                  disabled={!canCheckout}
                  onClick={completeCheckout}
                >
                  {checkingOut ? "Completing…" : "Complete Checkout"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

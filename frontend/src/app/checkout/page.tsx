"use client";

import { KioskQrScanner } from "@/components/kiosk-qr-scanner";
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
  ApiError,
  addLine,
  checkout,
  deleteLine,
  lookupCheckoutCode,
  lookupClient,
  reissueCard,
  scan,
  type CheckoutResult,
  type ExitReview,
  type ScanHit,
  type SessionView,
  type StaffMatch,
} from "@/lib/api";
import { ScanLine } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

function flags(row: Pick<SessionView, "dm" | "htn" | "ckd34" | "k_limit_ordered" | "allergens">) {
  return [
    row.dm ? "Diabetes" : null,
    row.htn ? "High blood pressure" : null,
    row.ckd34 ? "Kidney disease (stage 3–4)" : null,
    row.k_limit_ordered ? "Potassium limit" : null,
    ...row.allergens,
  ].filter((item): item is string => Boolean(item));
}

function reasonLine(hit: ScanHit) {
  const text = hit.reasons
    .map((reason) => reason.message || reason.rule_id || reason.source)
    .filter(Boolean);
  if (text.length) return text.join("; ");
  if (hit.verdict === "unknown") return "Unknown item";
  return hit.verdict;
}

export default function CheckoutPage() {
  const [codeInput, setCodeInput] = useState("");
  const [camera, setCamera] = useState(false);
  const [review, setReview] = useState<ExitReview | null>(null);
  const session = review ? { session_id: review.sessionId } : null;
  const [lines, setLines] = useState<ExitReview["lines"]>([]);
  const [code, setCode] = useState("");
  const [blocked, setBlocked] = useState<ScanHit | null>(null);
  const [refusal, setRefusal] = useState<{ error: string; message: string } | null>(null);
  const [receipt, setReceipt] = useState<CheckoutResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lookupName, setLookupName] = useState("");
  const [found, setFound] = useState<StaffMatch[]>([]);
  const [issued, setIssued] = useState<string | null>(null);

  /** Re-read the shopper's cart and what must be removed, straight from the rules engine. */
  async function refresh(code: string) {
    const next = await lookupCheckoutCode(code);
    setReview(next);
    setLines(next.lines);
    return next;
  }

  async function loadSession(e?: FormEvent, value?: string) {
    e?.preventDefault();
    const code = (value ?? codeInput).trim();
    if (!code) return;
    setBusy("session");
    setReceipt(null);
    setRefusal(null);
    setBlocked(null);
    try {
      await refresh(code);
      setCamera(false);
      setCodeInput("");
    } catch (err) {
      setReview(null);
      setLines([]);
      toast.error(err instanceof Error ? err.message : "Could not load that code");
    } finally {
      setBusy(null);
    }
  }

  async function onScan(e?: FormEvent) {
    e?.preventDefault();
    const id = session?.session_id;
    const trimmed = code.trim();
    if (!id || !trimmed || busy) return;
    setBusy("scan");
    setBlocked(null);
    setRefusal(null);
    try {
      const hit = await scan(id, trimmed);
      if ((hit.verdict === "green" || hit.verdict === "yellow") && hit.product?.id) {
        await addLine(id, hit.product.id);
        if (review) await refresh(review.code);
        setCode("");
      } else {
        setBlocked(hit);
        setCode("");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setRefusal({ error: err.error, message: err.message });
        try {
          if (review) await refresh(review.code);
        } catch {
          /* keep the cart already on screen */
        }
      } else {
        toast.error("Scan failed");
      }
    } finally {
      setBusy(null);
    }
  }

  async function remove(productId: string) {
    const id = session?.session_id;
    if (!id) return;
    setBusy("cart");
    try {
      await deleteLine(id, productId);
      if (review) await refresh(review.code);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the line");
    } finally {
      setBusy(null);
    }
  }

  async function finish() {
    const id = session?.session_id;
    if (!id || lines.length === 0) return;
    setBusy("checkout");
    setRefusal(null);
    try {
      const sold = await checkout(id);
      const names = new Map(lines.map((line) => [line.product_id, line.name]));
      sold.lines = sold.lines.map((line) => ({
        ...line,
        product_name: line.product_name || names.get(line.product_id) || line.product_id,
      }));
      setReceipt(sold);
      setLines([]);
    } catch (err) {
      if (err instanceof ApiError) {
        setRefusal({ error: err.error, message: err.message });
        try {
          if (review) await refresh(review.code);
        } catch {
          /* leave the cart that was already on screen */
        }
      } else {
        toast.error("Checkout failed");
      }
    } finally {
      setBusy(null);
    }
  }

  async function onLookup(e: FormEvent) {
    e.preventDefault();
    const name = lookupName.trim();
    if (!name) return;
    setBusy("lookup");
    setIssued(null);
    try {
      setFound(await lookupClient(name));
    } catch (err) {
      setFound([]);
      toast.error(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setBusy(null);
    }
  }

  async function onReissue(match: StaffMatch) {
    setBusy("reissue");
    try {
      const row = await reissueCard(match.client_id);
      setIssued(row.card_token);
      setFound((current) =>
        current.map((item) =>
          item.client_id === match.client_id ? { ...item, token_status: "active" } : item,
        ),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reissue failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <ol className="grid gap-3 sm:grid-cols-3" aria-label="Checkout steps">
        {[
          ["1", "Load the shopper", "Scan the QR on their phone or type the 4-digit code.", !!review],
          ["2", "Review the cart", "Remove anything marked Must remove before they leave.", !!review?.canPass],
          ["3", "Complete checkout", "Stock is updated and a receipt is shown.", !!receipt],
        ].map(([n, title, body, done]) => (
          <li key={String(n)} className={`flex gap-3 rounded-2xl border p-4 ${done ? "border-primary/40 bg-primary/5" : "bg-card"}`}>
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {done ? "✓" : String(n)}
            </span>
            <div>
              <p className="font-semibold">{String(title)}</p>
              <p className="text-sm text-muted-foreground">{String(body)}</p>
            </div>
          </li>
        ))}
      </ol>

      {refusal ? (
        <Alert variant="destructive">
          <AlertTitle className="text-lg">{refusal.error}</AlertTitle>
          <AlertDescription className="text-base">
            {refusal.message} The cart was not sold.
          </AlertDescription>
        </Alert>
      ) : null}

      {receipt ? (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-2xl">Checkout complete</CardTitle>
            <CardDescription>
              Session {receipt.session_id} is {receipt.status}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-xl border text-lg">
              {receipt.lines.map((line) => (
                <li key={`${line.product_id}-${line.grant_id}`} className="flex justify-between gap-3 px-4 py-3">
                  <span>{line.product_name}</span>
                  <span className="text-muted-foreground">
                    ×{line.qty} · {line.tier_id} · {line.grant_id}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit rounded-2xl">
          <CardHeader>
            <CardTitle className="text-xl">Shopper</CardTitle>
            <CardDescription>Scan the QR on the shopper&apos;s phone, or type the 4-digit code under it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="space-y-2" onSubmit={loadSession}>
              <Label htmlFor="checkout-code">Checkout code</Label>
              <Input
                id="checkout-code"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                placeholder="e.g. 4821"
                inputMode="numeric"
                className="h-14 rounded-xl text-center font-mono text-3xl tracking-[0.4em]"
                autoComplete="off"
                autoFocus
              />
              <Button type="submit" className="h-12 w-full rounded-xl text-base" disabled={busy === "session" || !codeInput.trim()}>
                {busy === "session" ? "Loading…" : "Load shopper"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full rounded-xl text-base"
                onClick={() => setCamera((on) => !on)}
              >
                <ScanLine className="size-5" />
                {camera ? "Close camera" : "Scan QR with camera"}
              </Button>
            </form>
            {camera ? (
              <KioskQrScanner active={busy !== "session"} onScan={(value) => loadSession(undefined, value)} />
            ) : null}
            {review ? (
              <div className="space-y-2 text-base">
                <p className="text-2xl font-bold">{review.client.name}</p>
                <Badge className="rounded-full text-base">Diet tier {review.client.tier_id}</Badge>
                <p>Household of {review.client.household_size}</p>
                {review.store ? <p className="text-muted-foreground">{review.store} · code {review.code}</p> : null}
                <div className="flex flex-wrap gap-1.5">
                  {flags(review.client).map((chip) => (
                    <Badge key={chip} variant="outline" className="rounded-full">
                      {chip}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <ScanLine className="size-5" />
                Scan an extra item (optional)
              </CardTitle>
              <CardDescription>For something the shopper is carrying that is not in their app cart.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form className="flex gap-2" onSubmit={onScan}>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Barcode or internal code"
                  className="h-14 flex-1 rounded-xl text-lg"
                  disabled={!session || !!busy}
                />
                <Button type="submit" className="h-14 rounded-xl text-lg" disabled={!session || !code.trim() || !!busy}>
                  Add
                </Button>
              </form>
              {blocked ? (
                <Alert variant={blocked.verdict === "red" || blocked.verdict === "unknown" ? "destructive" : "default"}>
                  <AlertTitle className="flex items-center gap-2 text-lg">
                    <VerdictBadge verdict={blocked.verdict} />
                    {blocked.product?.name ?? "Not recognized"}
                  </AlertTitle>
                  <AlertDescription className="space-y-3 text-base">
                    <p>{reasonLine(blocked)}</p>
                    {blocked.swaps.length > 0 ? (
                      <ul className="space-y-1">
                        {blocked.swaps.map((swap) => (
                          <li key={swap.id}>
                            {swap.name}
                            {swap.location ? ` · ${swap.location}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="font-semibold">Stopped: this item was not added. Please set it aside and offer a swap.</p>
                  </AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-xl">
                Cart
                {lines.length > 0 ? (
                  <span className="text-base font-normal text-muted-foreground">
                    {lines.reduce((n, l) => n + l.qty, 0)} items
                  </span>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {lines.length === 0 ? (
                <p className="rounded-xl border border-dashed py-8 text-center text-muted-foreground">
                  {review ? "The shopper's cart is empty." : "Load a shopper to see their cart."}
                </p>
              ) : (
                <ul className="divide-y rounded-xl border">
                  {lines.map((line) => (
                    <li key={line.product_id} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${line.mustRemove ? "bg-destructive/5" : ""}`}>
                      <div>
                        <p className="text-lg font-medium">
                          {line.name} <span className="text-muted-foreground">×{line.qty}</span>
                        </p>
                        <p className={`text-sm ${line.mustRemove ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                          {line.mustRemove ? `Must remove · ${line.reason || "not on this shopper's plan"}` : line.reason}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <VerdictBadge verdict={line.verdict} />
                        <Button variant="outline" className="rounded-xl" onClick={() => remove(line.product_id)} disabled={!!busy}>
                          Remove
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {review && !review.canPass && lines.length > 0 ? (
                <Alert variant="destructive">
                  <AlertTitle>Not ready to pass</AlertTitle>
                  <AlertDescription>
                    Remove the items marked Must remove. The shopper can only leave with what their plan allows.
                  </AlertDescription>
                </Alert>
              ) : null}
              {review?.canPass && !receipt ? (
                <Alert>
                  <AlertTitle>Everything fits this shopper&apos;s plan</AlertTitle>
                  <AlertDescription>Check the bag matches the list, then complete checkout.</AlertDescription>
                </Alert>
              ) : null}
              <Button
                className="h-12 rounded-xl text-base"
                disabled={!review?.canPass || !!busy || !!receipt}
                onClick={finish}
              >
                {busy === "checkout" ? "Checking out…" : "Complete checkout"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <details className="group rounded-2xl border bg-card">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-6 font-semibold">
          Lost card? Look up a client and reissue
          <span className="text-sm font-normal text-muted-foreground group-open:hidden">Show</span>
        </summary>
        <div className="space-y-4 px-6 pb-6">
          <p className="text-sm text-muted-foreground">Exact legal name. The new card token is shown once.</p>
          <form className="flex flex-wrap gap-2" onSubmit={onLookup}>
            <Input
              value={lookupName}
              onChange={(e) => setLookupName(e.target.value)}
              placeholder="Exact legal name"
              className="h-12 max-w-md flex-1 rounded-xl"
            />
            <Button type="submit" className="h-12 rounded-xl" disabled={busy === "lookup"}>
              Look up
            </Button>
          </form>
          {found.map((match) => (
            <div key={match.client_id} className="space-y-2 text-base">
              <p>{match.legal_name}</p>
              <p>
                Tier {match.tier_id} · token {match.token_status}
              </p>
              <p className="font-mono text-xs break-all">{match.client_id}</p>
              <Button className="rounded-xl" onClick={() => onReissue(match)} disabled={busy === "reissue"}>
                Reissue card
              </Button>
            </div>
          ))}
          {issued ? (
            <Alert>
              <AlertTitle>New card token</AlertTitle>
              <AlertDescription className="space-y-2">
                <p className="font-mono text-sm break-all">{issued}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => navigator.clipboard.writeText(issued)}
                >
                  Copy
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      </details>
    </div>
  );
}

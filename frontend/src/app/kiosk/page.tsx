"use client";

import { KioskQrScanner } from "@/components/kiosk-qr-scanner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ApiError,
  getKioskCode,
  kioskCheckIn,
  setKioskCode,
  type KioskCheckInResult,
} from "@/lib/api";
import { AlertCircle, CheckCircle2, Clock3, KeyRound, QrCode } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, FormEvent } from "react";

type Screen =
  | { kind: "setup" }
  | { kind: "form" }
  | { kind: "in"; result: KioskCheckInResult }
  | { kind: "error"; message: string };

/**
 * Kiosk check-in = camera scan of phone QR (qr_token) or keypad client_code.
 * Not the legacy /floor/arrive card-token flow.
 */
export default function KioskPage() {
  const [code, setCode] = useState("");
  const [kioskCode, setKioskCodeInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"scan" | "keypad">("scan");
  const [screen, setScreen] = useState<Screen>(() =>
    getKioskCode() ? { kind: "form" } : { kind: "setup" },
  );
  const lastScan = useRef("");

  // After a successful check-in, return to the welcome screen for the next shopper.
  useEffect(() => {
    if (screen.kind !== "in") return;
    const t = window.setTimeout(() => {
      setCode("");
      lastScan.current = "";
      setScreen({ kind: "form" });
      setMode("scan");
    }, 12_000);
    return () => window.clearTimeout(t);
  }, [screen.kind]);

  function reset() {
    setCode("");
    lastScan.current = "";
    setScreen({ kind: "form" });
    setMode("scan");
  }

  function saveSetup(e?: FormEvent) {
    e?.preventDefault();
    const next = kioskCode.trim();
    if (!next) return;
    setKioskCode(next);
    setScreen({ kind: "form" });
  }

  const checkIn = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      // JWT-shaped / long strings = phone QR; short numeric = client_code keypad
      const looksQr = trimmed.length > 40 || trimmed.includes(".");
      const result = await kioskCheckIn(
        looksQr ? { qr_token: trimmed } : { client_code: trimmed },
      );
      setScreen({ kind: "in", result });
    } catch (err) {
      setScreen({
        kind: "error",
        message: err instanceof ApiError ? err.message : "please see a volunteer",
      });
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const onQrScanned = useCallback(
    (value: string) => {
      if (busy || screen.kind !== "form") return;
      if (value === lastScan.current) return;
      lastScan.current = value;
      void checkIn(value);
    },
    [busy, checkIn, screen.kind],
  );

  function submitKeypad(e?: FormEvent) {
    e?.preventDefault();
    void checkIn(code);
  }

  if (screen.kind === "setup") {
    return (
      <KioskShell>
        <form className="mx-auto flex w-full max-w-xl flex-col gap-4" onSubmit={saveSetup}>
          <h1 className="text-center text-3xl font-semibold">Kiosk setup</h1>
          <p className="text-center text-muted-foreground">
            Paste the store <span className="font-medium">X-Kiosk-Code</span> once. This tablet keeps it
            locally — no email login on this screen.
          </p>
          <Input
            value={kioskCode}
            onChange={(e) => setKioskCodeInput(e.target.value)}
            aria-label="Kiosk code"
            className="h-16 rounded-2xl text-center text-xl"
          />
          <Button type="submit" size="lg" className="h-14 rounded-2xl text-lg" disabled={!kioskCode.trim()}>
            Save and continue
          </Button>
        </form>
      </KioskShell>
    );
  }

  if (screen.kind === "in") {
    const { result } = screen;
    const queued = result.status === "queued";
    return (
      <KioskShell>
        <Card className="mx-auto w-full max-w-2xl rounded-3xl border-primary/20 shadow-sm">
          <CardHeader className="space-y-3 text-center">
            <div className={`mx-auto flex size-20 items-center justify-center rounded-full ${queued ? "bg-amber-100 text-amber-800" : "bg-primary/10 text-primary"}`} aria-hidden>
              {queued ? <Clock3 className="size-10" /> : <CheckCircle2 className="size-10" />}
            </div>
            <CardTitle className="text-4xl font-semibold tracking-tight">
              {queued ? "You are in the queue" : "Checked in"}
            </CardTitle>
            <CardDescription className="text-xl">
              {queued
                ? `Queue position ${result.queue_position ?? "—"}. A spot will open soon.`
                : "Grab a cart. Show this visit to the volunteer."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-5 text-lg">
            {result.store?.name ? <p className="text-muted-foreground">{result.store.name}</p> : null}
            <Button size="lg" className="h-16 min-w-48 rounded-2xl text-lg" onClick={reset}>
              Next shopper
            </Button>
            <p className="text-sm text-muted-foreground">This screen resets on its own in a few seconds.</p>
          </CardContent>
        </Card>
      </KioskShell>
    );
  }

  if (screen.kind === "error") {
    return (
      <KioskShell>
        <Card className="mx-auto w-full max-w-xl rounded-3xl shadow-sm">
          <CardHeader className="space-y-3 text-center">
            <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-destructive/10 text-destructive" aria-hidden>
              <AlertCircle className="size-10" />
            </div>
            <CardTitle className="text-3xl">Please see a volunteer</CardTitle>
            <CardDescription className="text-lg">{screen.message}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button size="lg" className="h-16 min-w-48 rounded-2xl text-lg" onClick={reset}>
              Try again
            </Button>
          </CardContent>
        </Card>
      </KioskShell>
    );
  }

  return (
    <KioskShell>
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6">
        <div className="space-y-3 text-center">
          <p className="text-sm font-medium tracking-wide text-primary uppercase">Check-in</p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Welcome to Epic Cure</h1>
          <p className="text-lg text-muted-foreground">
            Scan the QR on the shopper&apos;s phone, or enter their client code.
          </p>

        </div>

        <div className="grid w-full grid-cols-2 gap-1 rounded-2xl bg-muted p-1" role="tablist" aria-label="Check-in method">
          {(
            [
              ["scan", "Scan phone QR", QrCode],
              ["keypad", "Type client code", KeyRound],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mode === key}
              onClick={() => setMode(key)}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-xl text-base font-medium transition-colors ${mode === key ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </button>
          ))}
        </div>

        {mode === "scan" ? (
          <>
            <KioskQrScanner active={!busy} onScan={onQrScanned} />
            {busy ? <p className="text-lg">Checking in…</p> : null}
          </>
        ) : (
          <form className="flex w-full flex-col items-center gap-4" onSubmit={submitKeypad}>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              inputMode="numeric"
              aria-label="Client code"
              placeholder="Client code"
              className="h-20 rounded-2xl text-center text-2xl"
              maxLength={32}
            />
            <Button
              type="submit"
              size="lg"
              className="h-16 w-full rounded-2xl text-xl"
              disabled={!code.trim() || busy}
            >
              {busy ? "Checking in…" : "Check in"}
            </Button>
          </form>
        )}

        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setScreen({ kind: "setup" })}>
          Kiosk settings ({getKioskCode() || "not set"})
        </Button>
      </div>
    </KioskShell>
  );
}

function KioskShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background px-6 py-8">
      <div className="flex flex-1 items-center justify-center">{children}</div>
      <p className="pt-6 text-center text-sm text-muted-foreground">
        Staff?{" "}
        <Link href="/checkout" className="font-medium underline underline-offset-2">
          Back to the dashboard
        </Link>
      </p>
    </div>
  );
}

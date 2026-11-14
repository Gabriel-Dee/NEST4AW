"use client";

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
import Link from "next/link";
import { FormEvent, useState } from "react";

type Screen =
  | { kind: "setup" }
  | { kind: "form" }
  | { kind: "in"; result: KioskCheckInResult }
  | { kind: "error"; message: string };

export default function KioskPage() {
  const [token, setToken] = useState("");
  const [kioskCode, setKioskCodeInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [screen, setScreen] = useState<Screen>(() =>
    getKioskCode() ? { kind: "form" } : { kind: "setup" },
  );

  function reset() {
    setToken("");
    setScreen({ kind: "form" });
  }

  function saveSetup(e?: FormEvent) {
    e?.preventDefault();
    const code = kioskCode.trim();
    if (!code) return;
    setKioskCode(code);
    setScreen({ kind: "form" });
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = token.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const looksQr = trimmed.length > 40;
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
  }

  if (screen.kind === "setup") {
    return (
      <KioskShell>
        <form className="mx-auto flex w-full max-w-xl flex-col gap-4" onSubmit={saveSetup}>
          <h1 className="text-center text-3xl font-semibold">Kiosk setup</h1>
          <p className="text-center text-muted-foreground">
            Paste the store kiosk code once. It is stored on this tablet only.
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
            <p className="text-sm font-medium tracking-wide text-primary uppercase">Epic Cure</p>
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
            {result.store?.name ? <p>{result.store.name}</p> : null}
            <p className="text-center font-mono text-sm break-all">{result.visit_token}</p>
            <Button size="lg" className="h-16 min-w-48 rounded-2xl text-lg" onClick={reset}>
              Done
            </Button>
          </CardContent>
        </Card>
      </KioskShell>
    );
  }

  if (screen.kind === "error") {
    return (
      <KioskShell>
        <Card className="mx-auto w-full max-w-xl rounded-3xl shadow-sm">
          <CardHeader className="text-center">
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
      <form className="mx-auto flex w-full max-w-xl flex-col items-center gap-6" onSubmit={submit}>
        <div className="space-y-3 text-center">
          <p className="text-sm font-medium tracking-wide text-primary uppercase">Check-in</p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Welcome to Epic Cure</h1>
          <p className="text-lg text-muted-foreground">
            Enter client code or scan the phone QR. Bound kiosk: {getKioskCode() || "none"}
          </p>
        </div>
        <Input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
          aria-label="Client code or QR"
          className="h-20 rounded-2xl text-center text-2xl"
          maxLength={4000}
        />
        <Button
          type="submit"
          size="lg"
          className="h-16 w-full rounded-2xl text-xl"
          disabled={!token.trim() || busy}
        >
          {busy ? "Checking in…" : "Check in"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setScreen({ kind: "setup" })}>
          Rebind kiosk code
        </Button>
      </form>
    </KioskShell>
  );
}

function KioskShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background px-6 py-8">
      <div className="flex flex-1 items-center justify-center">{children}</div>
      <p className="pt-6 text-center text-xs text-muted-foreground">
        Staff?{" "}
        <Link href="/login" className="underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </div>
  );
}

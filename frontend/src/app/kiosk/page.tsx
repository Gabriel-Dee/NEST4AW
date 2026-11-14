"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { mockApi } from "@/lib/mock/api";
import type { FloorArriveResult } from "@/lib/types";
import { Delete, QrCode, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";

type Screen =
  | { kind: "welcome" }
  | { kind: "success"; result: FloorArriveResult }
  | { kind: "queued"; result: FloorArriveResult }
  | { kind: "expired"; result: FloorArriveResult }
  | { kind: "error"; message: string };

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "del"] as const;

function queueProgress(position?: number) {
  if (!position || position < 1) return 5;
  return Math.max(5, Math.min(95, 100 - position * 12));
}

export default function KioskPage() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [screen, setScreen] = useState<Screen>({ kind: "welcome" });

  const reset = useCallback(() => {
    setToken("");
    setScreen({ kind: "welcome" });
  }, []);

  const press = useCallback((key: (typeof KEYS)[number]) => {
    if (key === "clear") {
      setToken("");
      return;
    }
    if (key === "del") {
      setToken((t) => t.slice(0, -1));
      return;
    }
    setToken((t) => (t.length >= 8 ? t : t + key));
  }, []);

  const submit = useCallback(async () => {
    const trimmed = token.trim();
    if (!trimmed || busy) return;

    // Demo: force floor-full queue UI without mutating mockApi floor state.
    if (trimmed === "9999") {
      setScreen({
        kind: "queued",
        result: {
          session_id: "sess-demo-queue",
          status: "queued",
          tier_id: "T4",
          household_size: 2,
          queue_position: 3,
          eta_minutes: 6,
          first_name: "Guest",
          diet_label: "Diabetes + HTN",
        },
      });
      return;
    }

    setBusy(true);
    try {
      const result = await mockApi.floorArrive(trimmed);
      if (result.enrollment_expired) {
        setScreen({ kind: "expired", result });
      } else if (result.status === "queued") {
        setScreen({ kind: "queued", result });
      } else {
        setScreen({ kind: "success", result });
      }
    } catch (err) {
      setScreen({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Something went wrong — see a volunteer",
      });
    } finally {
      setBusy(false);
    }
  }, [token, busy]);

  if (screen.kind === "success") {
    const { result } = screen;
    return (
      <KioskShell>
        <Card className="mx-auto w-full max-w-2xl rounded-3xl border-primary/20 shadow-sm">
          <CardHeader className="space-y-3 text-center">
            <p className="text-sm font-medium tracking-wide text-primary uppercase">
              Epic Cure
            </p>
            <CardTitle className="text-4xl font-semibold tracking-tight">
              Welcome, {result.first_name}!
            </CardTitle>
            <CardDescription className="text-base">
              You&apos;re checked in – grab a cart!
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6">
            <div className="flex flex-wrap items-center justify-center gap-3">
              {result.diet_label ? (
                <Badge className="rounded-full px-4 py-2 text-sm">
                  {result.diet_label}
                </Badge>
              ) : null}
              <Badge
                variant="secondary"
                className="gap-1.5 rounded-full px-4 py-2 text-sm"
              >
                <Users className="size-4" aria-hidden />
                Household of {result.household_size}
              </Badge>
            </div>
            <div
              className="flex size-40 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-muted-foreground/30 bg-muted/40"
              aria-hidden
            >
              <QrCode className="size-16 text-muted-foreground" />
              <span className="mt-2 text-xs text-muted-foreground">
                Phone companion QR
              </span>
            </div>
            <Button
              size="lg"
              className="h-16 min-w-48 rounded-2xl text-lg"
              onClick={reset}
            >
              Done
            </Button>
          </CardContent>
        </Card>
      </KioskShell>
    );
  }

  if (screen.kind === "queued") {
    const { result } = screen;
    const pos = result.queue_position ?? 1;
    const eta = result.eta_minutes ?? pos * 2;
    return (
      <KioskShell>
        <Card className="mx-auto w-full max-w-2xl rounded-3xl shadow-sm">
          <CardHeader className="space-y-2 text-center">
            <p className="text-sm font-medium tracking-wide text-primary uppercase">
              Floor is full
            </p>
            <CardTitle className="text-3xl font-semibold tracking-tight">
              You&apos;re #{pos} in line
            </CardTitle>
            <CardDescription className="text-lg">
              About {eta} minutes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Progress value={queueProgress(pos)} className="w-full">
              <span className="text-sm text-muted-foreground">
                Position in queue
              </span>
            </Progress>
            <p className="text-center text-muted-foreground">
              We&apos;ll call you when a spot opens. Feel free to wait nearby.
            </p>
            <Button
              size="lg"
              variant="outline"
              className="mx-auto flex h-16 min-w-48 rounded-2xl text-lg"
              onClick={reset}
            >
              Back
            </Button>
          </CardContent>
        </Card>
      </KioskShell>
    );
  }

  if (screen.kind === "expired") {
    return (
      <KioskShell>
        <Card className="mx-auto w-full max-w-2xl rounded-3xl shadow-sm">
          <CardHeader className="space-y-3 text-center">
            <CardTitle className="text-3xl font-semibold tracking-tight">
              Hi{screen.result.first_name ? `, ${screen.result.first_name}` : ""}
            </CardTitle>
            <CardDescription className="text-lg leading-relaxed">
              Your program enrollment needs renewal – a volunteer will help you
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button
              size="lg"
              className="h-16 min-w-48 rounded-2xl text-lg"
              onClick={reset}
            >
              OK
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
            <CardTitle className="text-2xl">Please see a volunteer</CardTitle>
            <CardDescription className="capitalize">
              {screen.message}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button
              size="lg"
              className="h-16 min-w-48 rounded-2xl text-lg"
              onClick={reset}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      </KioskShell>
    );
  }

  return (
    <KioskShell>
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8 lg:flex-row lg:items-start lg:justify-center lg:gap-12">
        <div className="max-w-md space-y-4 text-center lg:text-left">
          <p className="text-sm font-medium tracking-wide text-primary uppercase">
            Check-in
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Welcome to Epic Cure
          </h1>
          <p className="text-muted-foreground">
            Enter your Client ID or card number, then tap Check in.
          </p>
          <p className="text-sm text-muted-foreground">
            Demo: try <strong>1001</strong> (Maria success),{" "}
            <strong>1005</strong> (Helen enrollment expired),{" "}
            <strong>9999</strong> (floor full / queue).
          </p>
        </div>

        <Card className="w-full max-w-md rounded-3xl shadow-sm">
          <CardContent className="space-y-4 pt-6">
            <div
              className="flex h-20 items-center justify-center rounded-2xl bg-muted/60 text-4xl font-semibold tracking-[0.2em] tabular-nums"
              aria-live="polite"
            >
              {token || "····"}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {KEYS.map((key) => (
                <Button
                  key={key}
                  type="button"
                  variant={
                    key === "clear" || key === "del" ? "secondary" : "outline"
                  }
                  className="h-16 min-h-16 rounded-2xl text-2xl font-semibold"
                  onClick={() => press(key)}
                  aria-label={
                    key === "del" ? "Delete" : key === "clear" ? "Clear" : key
                  }
                >
                  {key === "del" ? (
                    <Delete className="size-7" />
                  ) : key === "clear" ? (
                    "C"
                  ) : (
                    key
                  )}
                </Button>
              ))}
            </div>

            <Button
              size="lg"
              className="h-16 w-full rounded-2xl text-xl"
              disabled={!token || busy}
              onClick={submit}
            >
              {busy ? "Checking in…" : "Check in"}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="h-14 w-full gap-2 rounded-2xl text-muted-foreground"
              onClick={() => {
                /* QR scan placeholder */
              }}
            >
              <QrCode className="size-5" />
              Scan QR
            </Button>
          </CardContent>
        </Card>
      </div>
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

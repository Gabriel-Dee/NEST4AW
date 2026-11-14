"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { mockApi } from "@/lib/mock/api";
import type { AnalyticsKpis, AnalyticsPoint } from "@/lib/types";
import { Download } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type LoadState = "loading" | "ready" | "empty" | "error";

const GRANT_STREAMS = [
  "SNAP-Ed",
  "TEFAP",
  "CSFP",
  "Private foundation",
] as const;

function BarChart({
  title,
  points,
}: {
  title: string;
  points: AnalyticsPoint[];
}) {
  const max = Math.max(...points.map((p) => p.value), 1);
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {points.map((p) => (
          <div key={p.label} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>{p.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {p.value.toLocaleString()}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(p.value / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<AnalyticsKpis | null>(null);
  const [trend3, setTrend3] = useState<AnalyticsPoint[]>([]);
  const [trend6, setTrend6] = useState<AnalyticsPoint[]>([]);
  const [byCondition, setByCondition] = useState<AnalyticsPoint[]>([]);
  const [grantStream, setGrantStream] =
    useState<(typeof GRANT_STREAMS)[number]>("SNAP-Ed");

  const load = useCallback(async (mode: "ok" | "empty" | "error" = "ok") => {
    setState("loading");
    setError(null);
    try {
      if (mode === "error") throw new Error("Analytics unavailable");
      if (mode === "empty") {
        setKpis(null);
        setTrend3([]);
        setTrend6([]);
        setByCondition([]);
        setState("empty");
        return;
      }
      const data = await mockApi.getAnalytics();
      setKpis(data.kpis);
      setTrend3(data.trend3);
      setTrend6(data.trend6);
      setByCondition(data.byCondition);
      setState("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
      setState("error");
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load("ok"), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  function exportCsv() {
    if (!kpis) return;
    const rows = [
      ["grant_stream", "metric", "value"],
      [grantStream, "clients_served", String(kpis.clients_served)],
      [grantStream, "pounds_distributed", String(kpis.pounds_distributed)],
      [grantStream, "green_pct", String(kpis.green_pct)],
      ...trend6.map((p) => [grantStream, `trend6_${p.label}`, String(p.value)]),
      ...byCondition.map((p) => [
        grantStream,
        `condition_${p.label.replace(/\s+/g, "_")}`,
        String(p.value),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grant-report-${grantStream.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
            <p className="text-sm text-muted-foreground">
              Anonymized program KPIs — no client names
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => void load("ok")}
            >
              Reload
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => void load("empty")}
            >
              Simulate empty
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => void load("error")}
            >
              Simulate error
            </Button>
          </div>
        </div>

        {state === "loading" && (
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        )}

        {state === "error" && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {state === "empty" && (
          <Card className="rounded-2xl">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No analytics data for this period
            </CardContent>
          </Card>
        )}

        {state === "ready" && kpis && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="rounded-2xl">
                <CardHeader className="pb-2">
                  <CardDescription>Clients served</CardDescription>
                  <CardTitle className="text-3xl tabular-nums">
                    {kpis.clients_served.toLocaleString()}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card className="rounded-2xl">
                <CardHeader className="pb-2">
                  <CardDescription>Pounds distributed</CardDescription>
                  <CardTitle className="text-3xl tabular-nums">
                    {kpis.pounds_distributed.toLocaleString()}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card className="rounded-2xl">
                <CardHeader className="pb-2">
                  <CardDescription>% green scans</CardDescription>
                  <CardTitle className="text-3xl tabular-nums">
                    {kpis.green_pct}%
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Progress value={kpis.green_pct} />
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <BarChart title="3-month pounds trend" points={trend3} />
              <BarChart title="6-month pounds trend" points={trend6} />
            </div>
            <BarChart title="Pounds by condition" points={byCondition} />

            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-lg">Export grant report</CardTitle>
                <CardDescription>
                  CSV of anonymized aggregates for the selected grant stream
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3">
                <div className="w-56 space-y-1.5">
                  <Label>Grant stream</Label>
                  <Select
                    value={grantStream}
                    onValueChange={(v) =>
                      setGrantStream(
                        (v as (typeof GRANT_STREAMS)[number]) ?? "SNAP-Ed",
                      )
                    }
                  >
                    <SelectTrigger className="h-10 w-full rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GRANT_STREAMS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="gap-2 rounded-xl"
                  onClick={exportCsv}
                  type="button"
                >
                  <Download className="size-4" />
                  Export CSV
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>
  );
}

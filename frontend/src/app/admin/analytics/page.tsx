"use client";

import { Download } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dispensedReport, type ReportRow } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { FormEvent, useState } from "react";

function day(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${z(date.getMonth() + 1)}-${z(date.getDate())}`;
}

/** Anonymized aggregates only, so this file is safe to send to funders. */
function downloadCsv(rows: ReportRow[], from: string, to: string) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = [["day", "diet_tier", "grant", "units", "pounds"], ...rows.map((r) => [r.day, r.tier_id, r.grant_id, r.units, r.pounds])]
    .map((line) => line.map(esc).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `epic-cure-distribution_${from || "start"}_${to || "today"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportPage() {
  const { user } = useAuth();
  const [from, setFrom] = useState(day(-30));
  const [to, setTo] = useState(day(0));
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const totals = {
    units: rows.reduce((n, r) => n + (Number(r.units) || 0), 0),
    pounds: rows.reduce((n, r) => n + (Number(r.pounds) || 0), 0),
    grants: new Set(rows.map((r) => r.grant_id)).size,
    days: new Set(rows.map((r) => r.day)).size,
  };

  async function load(e?: FormEvent) {
    e?.preventDefault();
    if (!user || (user.role !== "admin" && user.role !== "community_partner")) return;
    setBusy(true);
    setError(null);
    try {
      setRows(await dispensedReport(from, to));
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Could not load the report");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-muted-foreground">
        Food distributed by day, diet tier and grant. Totals only: no client names or IDs ever appear here.
      </p>
      <form className="flex flex-wrap items-end gap-3" onSubmit={load}>
        <div className="space-y-1.5">
          <Label htmlFor="from">From</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 rounded-xl" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">To</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 rounded-xl" />
        </div>
        <Button type="submit" className="rounded-xl" disabled={busy}>
          {busy ? "Loading…" : "Show report"}
        </Button>
        <Button type="button" variant="outline" className="gap-2 rounded-xl" disabled={rows.length === 0} onClick={() => downloadCsv(rows, from, to)}>
          <Download className="size-4" aria-hidden />
          Download CSV
        </Button>
      </form>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Units distributed", totals.units.toLocaleString()],
          ["Pounds distributed", totals.pounds.toLocaleString(undefined, { maximumFractionDigits: 1 })],
          ["Grants", String(totals.grants)],
          ["Days with distribution", String(totals.days)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border bg-card p-5">
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Day</TableHead>
              <TableHead>Diet tier</TableHead>
              <TableHead>Grant</TableHead>
              <TableHead className="text-right">Units</TableHead>
              <TableHead className="text-right">Pounds</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  {busy ? "Loading…" : "Choose a date range and select Show report."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, index) => (
                <TableRow key={`${row.day}-${row.tier_id}-${row.grant_id}-${index}`}>
                  <TableCell>{row.day}</TableCell>
                  <TableCell>{row.tier_id}</TableCell>
                  <TableCell>{row.grant_id}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.units}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.pounds}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

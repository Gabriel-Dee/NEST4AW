"use client";

import { AppShell } from "@/components/layout/app-shell";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mockApi } from "@/lib/mock/api";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AlertTriangle, Clock, Package, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const LOW_STOCK = 10;
const AISLE_ORDER = ["A", "B", "C", "D", "E"] as const;

type TableState = "loading" | "ready" | "empty" | "error";

function daysUntil(dateStr: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  return Math.ceil((d.getTime() - today.getTime()) / 86400000);
}

function binLabel(p: Product) {
  return `${p.aisle}/${p.shelf}/${p.bin_code}`;
}

export default function WarehousePage() {
  const [items, setItems] = useState<Product[]>([]);
  const [tableState, setTableState] = useState<TableState>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [checkedBins, setCheckedBins] = useState<Record<string, boolean>>({});
  const floor = mockApi.getFloorBoard();

  const load = useCallback((mode: "ok" | "empty" | "error" = "ok") => {
    setTableState("loading");
    setErrorMsg(null);
    window.setTimeout(() => {
      if (mode === "error") {
        setItems([]);
        setErrorMsg("Could not load catalog");
        setTableState("error");
        return;
      }
      if (mode === "empty") {
        setItems([]);
        setTableState("empty");
        return;
      }
      setItems(mockApi.getCatalog());
      setTableState("ready");
    }, 400);
  }, []);

  useEffect(() => {
    load("ok");
  }, [load]);

  const categories = useMemo(() => {
    const set = new Set(items.map((p) => p.category));
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.bin_code.toLowerCase().includes(q) ||
        p.internal_code.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });
  }, [items, search, category]);

  const lowStock = useMemo(
    () => items.filter((p) => p.stock < LOW_STOCK),
    [items],
  );
  const expiring = useMemo(
    () => items.filter((p) => daysUntil(p.expires_on) <= 7),
    [items],
  );

  const restockList = useMemo(() => {
    return [...lowStock].sort((a, b) => {
      const ai = AISLE_ORDER.indexOf(a.aisle as (typeof AISLE_ORDER)[number]);
      const bi = AISLE_ORDER.indexOf(b.aisle as (typeof AISLE_ORDER)[number]);
      if (ai !== bi) return ai - bi;
      return (
        a.shelf.localeCompare(b.shelf) || a.bin_code.localeCompare(b.bin_code)
      );
    });
  }, [lowStock]);

  const refillBins = useMemo(
    () => new Set(restockList.map((p) => p.bin_code)),
    [restockList],
  );

  const aisleBins = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const a of AISLE_ORDER) map[a] = [];
    for (const p of items) {
      if (!map[p.aisle]) map[p.aisle] = [];
      if (!map[p.aisle].includes(p.bin_code)) map[p.aisle].push(p.bin_code);
    }
    for (const a of AISLE_ORDER) map[a].sort();
    return map;
  }, [items]);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Warehouse</h1>
            <p className="text-sm text-muted-foreground">
              Inventory, FIFO alerts, and restock routes
            </p>
          </div>
          <Card className="min-w-[220px] rounded-2xl">
            <CardContent className="flex items-center gap-3 pt-4 pb-4">
              <Users className="size-5 text-primary" aria-hidden />
              <div>
                <p className="text-sm font-medium">
                  {floor.on_floor} / {floor.cap} shoppers on floor
                </p>
                <p className="text-xs text-muted-foreground">
                  Queue length: {floor.queue}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertTitle>Low stock</AlertTitle>
            <AlertDescription>
              {lowStock.length} item{lowStock.length === 1 ? "" : "s"} below{" "}
              {LOW_STOCK} units
            </AlertDescription>
          </Alert>
          <Alert>
            <Clock className="size-4" />
            <AlertTitle>Expires within 7 days (FIFO)</AlertTitle>
            <AlertDescription>
              {expiring.length} item{expiring.length === 1 ? "" : "s"} to rotate
              first
            </AlertDescription>
          </Alert>
        </div>

        <Tabs defaultValue="inventory">
          <TabsList>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="restock">Restock route</TabsTrigger>
          </TabsList>

          <TabsContent value="inventory" className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[200px] flex-1 space-y-1.5">
                <Label htmlFor="wh-search">Search</Label>
                <Input
                  id="wh-search"
                  placeholder="Product, bin, code…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="w-44 space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={category}
                  onValueChange={(v) => setCategory(v ?? "all")}
                >
                  <SelectTrigger className="h-10 w-full rounded-xl">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => load("ok")}
                  className="rounded-xl"
                >
                  Reload
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => load("empty")}
                  className="rounded-xl"
                >
                  Simulate empty
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => load("error")}
                  className="rounded-xl"
                >
                  Simulate error
                </Button>
              </div>
            </div>

            {tableState === "loading" && (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-lg" />
                ))}
              </div>
            )}

            {tableState === "error" && (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            )}

            {tableState === "empty" && (
              <Card className="rounded-2xl">
                <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                  <Package className="size-8 opacity-50" />
                  <p>No inventory rows</p>
                </CardContent>
              </Card>
            )}

            {tableState === "ready" && filtered.length === 0 && (
              <Card className="rounded-2xl">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  No products match filters
                </CardContent>
              </Card>
            )}

            {tableState === "ready" && filtered.length > 0 && (
              <div className="overflow-x-auto rounded-2xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Bin</TableHead>
                      <TableHead>Batch arrival</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead>Nutrition flags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => {
                      const soon = daysUntil(p.expires_on) <= 7;
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="capitalize">
                            {p.category}
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                p.stock < LOW_STOCK &&
                                  "font-semibold text-destructive",
                              )}
                            >
                              {p.stock}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {binLabel(p)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {p.batch_arrived}
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                soon && "font-medium text-amber-700",
                              )}
                            >
                              {p.expires_on}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {p.allergens.map((a) => (
                                <Badge
                                  key={a}
                                  variant="secondary"
                                  className="rounded-full"
                                >
                                  {a}
                                </Badge>
                              ))}
                              {p.sodium_mg != null && p.sodium_mg >= 460 && (
                                <Badge
                                  variant="outline"
                                  className="rounded-full"
                                >
                                  Na {p.sodium_mg}mg
                                </Badge>
                              )}
                              {(p.added_sugar_g ?? 0) >= 0.5 && (
                                <Badge
                                  variant="outline"
                                  className="rounded-full"
                                >
                                  Sugar {p.added_sugar_g}g
                                </Badge>
                              )}
                              {p.allergens.length === 0 &&
                                !(p.sodium_mg != null && p.sodium_mg >= 460) &&
                                (p.added_sugar_g ?? 0) < 0.5 && (
                                  <span className="text-xs text-muted-foreground">
                                    —
                                  </span>
                                )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="restock" className="space-y-4">
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-lg">
                  Restock route A → B → D
                </CardTitle>
                <CardDescription>
                  Aisle-sequenced checklist for bins below {LOW_STOCK} units.
                  Walk A, then B, then D (and remaining aisles).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <ol className="space-y-2">
                  {restockList.length === 0 && (
                    <li className="text-sm text-muted-foreground">
                      Nothing to refill
                    </li>
                  )}
                  {restockList.map((p, idx) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-3 rounded-xl border px-3 py-2"
                    >
                      <Checkbox
                        id={`restock-${p.id}`}
                        checked={!!checkedBins[p.id]}
                        onCheckedChange={(v) =>
                          setCheckedBins((prev) => ({
                            ...prev,
                            [p.id]: !!v,
                          }))
                        }
                      />
                      <Label
                        htmlFor={`restock-${p.id}`}
                        className="flex flex-1 cursor-pointer flex-wrap items-center gap-2 text-sm font-normal"
                      >
                        <span className="text-muted-foreground">{idx + 1}.</span>
                        <Badge variant="outline" className="rounded-full">
                          Aisle {p.aisle}
                        </Badge>
                        <span className="font-medium">{p.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {binLabel(p)} · stock {p.stock}
                        </span>
                      </Label>
                    </li>
                  ))}
                </ol>

                <div>
                  <p className="mb-2 text-sm font-medium">Floor bin map</p>
                  <div className="grid gap-3 sm:grid-cols-5">
                    {AISLE_ORDER.map((aisle) => (
                      <div
                        key={aisle}
                        className="rounded-xl border bg-muted/30 p-2"
                      >
                        <p className="mb-2 text-center text-xs font-semibold">
                          Aisle {aisle}
                        </p>
                        <div className="grid grid-cols-2 gap-1">
                          {(aisleBins[aisle] ?? []).slice(0, 8).map((bin) => {
                            const hit = refillBins.has(bin);
                            return (
                              <div
                                key={bin}
                                title={bin}
                                className={cn(
                                  "truncate rounded-md px-1 py-1 text-center font-mono text-[10px]",
                                  hit
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-background text-muted-foreground",
                                )}
                              >
                                {bin}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Highlighted bins need refill
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { asRows, floorBoard, listInventory, listLots, listProducts } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AlertTriangle, Clock, PackageSearch, RefreshCw, Search, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Row = Record<string, unknown>;

const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const time = (v: unknown) => {
  const d = new Date(str(v));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

function Stat({ icon: Icon, label, value, tone = "default" }: { icon: typeof Users; label: string; value: string | number; tone?: "default" | "warn" | "danger" }) {
  const toneClass = tone === "danger" ? "text-destructive" : tone === "warn" ? "text-amber-700" : "text-primary";
  return (
    <Card className="rounded-2xl">
      <CardContent className="flex items-center gap-4 py-5">
        <div className={`flex size-11 items-center justify-center rounded-xl bg-muted ${toneClass}`}>
          <Icon className="size-5" aria-hidden />
        </div>
        <div>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{text}</p>;
}

export default function WarehousePage() {
  const { user } = useAuth();
  const [board, setBoard] = useState<Awaited<ReturnType<typeof floorBoard>> | null>(null);
  const [inventory, setInventory] = useState<Row[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  const [lots, setLots] = useState<{ product: string; rows: Row[] } | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "expiring">("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (q = "") => {
    setError(null);
    setLoading(true);
    try {
      const [b, inv, prod] = await Promise.all([floorBoard(), listInventory(), listProducts(q)]);
      setBoard(b);
      setInventory(asRows(inv));
      setProducts(asRows(prod));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the warehouse.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || (user.role !== "warehouse_staff" && user.role !== "admin")) return;
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [user, load]);

  const nameOf = useMemo(() => {
    const map = new Map(products.map((p) => [str(p.id), str(p.name)]));
    return (id: unknown) => map.get(str(id)) || "Unknown product";
  }, [products]);

  const lowCount = inventory.filter((r) => r.low_stock === true).length;
  const expiringCount = inventory.filter((r) => num(r.expiring_units) > 0).length;
  const shown = inventory.filter((r) =>
    filter === "low" ? r.low_stock === true : filter === "expiring" ? num(r.expiring_units) > 0 : true,
  );

  async function openLots(id: unknown, name: string) {
    setError(null);
    try {
      setLots({ product: name, rows: asRows(await listLots(str(id))) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load lots.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Users} label={`On the floor (max ${board?.max_floor ?? "—"})`} value={board?.active_count ?? "—"} />
        <Stat icon={Clock} label="Waiting in queue" value={board?.queued_count ?? "—"} tone={(board?.queued_count ?? 0) > 0 ? "warn" : "default"} />
        <Stat icon={PackageSearch} label="Bins low on stock" value={lowCount} tone={lowCount > 0 ? "warn" : "default"} />
        <Stat icon={AlertTriangle} label="Bins with items expiring soon" value={expiringCount} tone={expiringCount > 0 ? "danger" : "default"} />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="inventory" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="floor">On the floor</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
          </TabsList>
          <Button variant="outline" className="gap-2 rounded-xl" onClick={() => void load(query.trim())} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </Button>
        </div>

        {/* Inventory */}
        <TabsContent value="inventory" className="space-y-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter inventory">
            {(
              [
                ["all", `All bins (${inventory.length})`],
                ["low", `Low stock (${lowCount})`],
                ["expiring", `Expiring soon (${expiringCount})`],
              ] as const
            ).map(([key, label]) => (
              <Button key={key} size="sm" variant={filter === key ? "default" : "outline"} className="rounded-full" aria-pressed={filter === key} onClick={() => setFilter(key)}>
                {label}
              </Button>
            ))}
          </div>
          {shown.length === 0 ? (
            <Empty text={loading ? "Loading inventory…" : "No bins match this filter."} />
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">In stock</TableHead>
                    <TableHead className="text-right">Min</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((r, i) => {
                    const name = nameOf(r.product_id);
                    return (
                      <TableRow key={str(r.id) || i}>
                        <TableCell className="max-w-xs truncate font-medium" title={name}>
                          {name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          Aisle {str(r.aisle)} · Shelf {str(r.shelf)} · {str(r.bin_code)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{num(r.stock)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{num(r.min_qty)}</TableCell>
                        <TableCell className="space-x-1">
                          {r.low_stock === true ? <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">Low stock</Badge> : null}
                          {num(r.expiring_units) > 0 ? <Badge variant="outline" className="border-red-200 bg-red-50 text-red-800">{num(r.expiring_units)} expiring</Badge> : null}
                          {num(r.expired_units) > 0 ? <Badge variant="outline">{num(r.expired_units)} expired</Badge> : null}
                          {r.low_stock !== true && num(r.expiring_units) === 0 ? <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">OK</Badge> : null}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => void openLots(r.product_id, name)}>
                            Lots
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {lots ? (
            <Card className="rounded-2xl">
              <CardContent className="space-y-3 py-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Lots · {lots.product}</h2>
                  <Button size="sm" variant="ghost" onClick={() => setLots(null)}>
                    Close
                  </Button>
                </div>
                {lots.rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No lots for this product.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Arrived</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead>Grant</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lots.rows.map((l, i) => (
                        <TableRow key={str(l.id) || i}>
                          <TableCell>{str(l.arrived_on) || "—"}</TableCell>
                          <TableCell>{str(l.expires_on) || "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{num(l.qty ?? l.quantity)}</TableCell>
                          <TableCell className="text-muted-foreground">{str(l.grant_id) || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* Floor */}
        <TabsContent value="floor">
          {(board?.rows ?? []).length === 0 ? (
            <Empty text="Nobody is shopping right now." />
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Shopper</TableHead>
                    <TableHead>Diet tier</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Session ends</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {((board?.rows ?? []) as unknown as Row[]).map((r, i) => (
                    <TableRow key={str(r.session_id) || i}>
                      <TableCell className="font-mono text-xs text-muted-foreground" title={str(r.session_id)}>
                        Visit …{str(r.session_id).slice(-6)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{str(r.tier_id) || "—"}</Badge>
                      </TableCell>
                      <TableCell className="capitalize">{str(r.status)}</TableCell>
                      <TableCell className="tabular-nums">{time(r.lease_expires_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Products */}
        <TabsContent value="products" className="space-y-3">
          <form
            className="flex max-w-md gap-2"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              void load(query.trim());
            }}
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" aria-label="Search products" className="h-10 rounded-xl pl-9" />
            </div>
            <Button type="submit" className="rounded-xl">
              Search
            </Button>
          </form>
          {products.length === 0 ? (
            <Empty text={loading ? "Loading products…" : "No products found."} />
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Sodium (mg)</TableHead>
                    <TableHead className="text-right">Sugar (g)</TableHead>
                    <TableHead className="text-right">Potassium (mg)</TableHead>
                    <TableHead>Barcode</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p, i) => (
                    <TableRow key={str(p.id) || i}>
                      <TableCell className="max-w-xs truncate font-medium" title={str(p.name)}>
                        {str(p.name)}
                      </TableCell>
                      <TableCell className="max-w-[10rem] truncate text-muted-foreground">{str(p.brand) || "—"}</TableCell>
                      <TableCell className="capitalize">{str(p.category) || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.sodium_mg == null ? "—" : Math.round(num(p.sodium_mg))}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.sugar_g == null ? "—" : num(p.sugar_g).toFixed(1)}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.potassium_mg == null ? "—" : Math.round(num(p.potassium_mg))}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{str(p.barcode) || str(p.internal_code) || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

"use client";

/**
 * Callers: staff/admin nav → /kiosk/display.
 * Shows NEST4AW:CHECKIN:<store_id> QR for mobile /check-in to scan.
 * User: "kiosk menu on admin or store staff roles which displays a qr code"
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ApiError,
  listStoresV1,
  storeCheckInQrPayload,
  type StoreListRow,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import QRCode from "react-qr-code";

export default function KioskDisplayPage() {
  const { user } = useAuth();
  const [stores, setStores] = useState<StoreListRow[]>([]);
  const [storeId, setStoreId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    listStoresV1()
      .then((rows) => {
        setStores(rows);
        if (rows[0]) setStoreId(rows[0].id);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Could not load stores");
      });
  }, []);

  const selected = stores.find((s) => s.id === storeId) ?? stores[0];
  const payload = useMemo(
    () => (selected ? storeCheckInQrPayload(selected.id) : ""),
    [selected],
  );

  if (!user || (user.role !== "warehouse_staff" && user.role !== "admin")) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <p>Staff or admin login required.</p>
        <Link href="/login" className="underline">
          Sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-2xl flex-col items-center justify-center gap-6 p-6">
      <Card className="w-full rounded-3xl">
        <CardHeader className="text-center">
          <p className="text-sm font-medium tracking-wide text-primary uppercase">Kiosk display</p>
          <CardTitle className="text-3xl">Scan to check in</CardTitle>
          <CardDescription className="text-base">
            Shoppers open Check in on the phone and point the camera here.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-5">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {stores.length > 1 ? (
            <label className="flex w-full flex-col gap-2 text-sm">
              Store
              <select
                className="h-11 rounded-xl border px-3"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <p className="text-xl font-semibold">{selected?.name ?? "Loading store…"}</p>
          {payload ? (
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <QRCode value={payload} size={260} />
            </div>
          ) : null}
          <p className="max-w-sm break-all text-center font-mono text-xs text-muted-foreground">
            {payload || "—"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/kiosk"
              className="inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium"
            >
              Open scanner kiosk
            </Link>
            <Link
              href="/warehouse"
              className="inline-flex h-10 items-center rounded-full px-4 text-sm font-medium text-muted-foreground"
            >
              Back to warehouse
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

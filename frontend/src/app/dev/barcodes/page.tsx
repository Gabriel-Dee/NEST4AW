"use client";

/**
 * Callers: Next route /dev/barcodes (manual URL / nav). Uses listDevBarcodes → GET /api/v1/dev/barcodes.
 * No prior barcodes page (Glob 0). Fallback rows are synthetic contract SKUs.
 * User: "Web: add /dev/barcodes page that calls GET /dev/barcodes and renders each code as a real scannable barcode"
 */
import { listDevBarcodes } from "@/lib/api";
import JsBarcode from "jsbarcode";
import { useEffect, useRef, useState } from "react";

type Row = {
  code: string;
  name?: string;
  expected?: string;
  persona?: string;
};

function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, { format: "CODE128", displayValue: true, height: 60, margin: 8 });
    } catch {
      /* non-barcodeable codes still show as text */
    }
  }, [value]);
  return <svg ref={ref} />;
}

export default function DevBarcodesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listDevBarcodes()
      .then((data) => {
        const list = Array.isArray(data)
          ? data
          : data && typeof data === "object" && Array.isArray((data as { barcodes?: unknown }).barcodes)
            ? (data as { barcodes: unknown[] }).barcodes
            : [];
        setRows(
          list.map((item, i) => {
            const row = (item ?? {}) as Record<string, unknown>;
            return {
              code: String(row.code ?? row.barcode ?? row.sku ?? i),
              name: row.name == null ? undefined : String(row.name),
              expected: String(row.expected_level ?? row.expected_color ?? row.color ?? ""),
              persona: row.persona == null ? "Maria" : String(row.persona),
            };
          }),
        );
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "GET /api/v1/dev/barcodes missing");
        setRows([
          { code: "BEANS", name: "Low-sodium black beans", expected: "green", persona: "Maria" },
          { code: "RICE", name: "Brown rice", expected: "green", persona: "Maria" },
          { code: "SPINACH", name: "Fresh spinach", expected: "green", persona: "Maria" },
          { code: "SOUP", name: "Canned chicken noodle", expected: "red", persona: "Maria" },
          { code: "OJ", name: "Orange juice", expected: "red", persona: "Maria" },
          { code: "TOMATOES", name: "Canned diced tomatoes", expected: "yellow", persona: "Maria" },
          { code: "00041196419429", name: "Sample UPC", expected: "n/a", persona: "Maria" },
        ]);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="mx-auto max-w-3xl bg-[#f7f3ec] p-6 text-[#1c1917] print:bg-white">
      <h1 className="text-3xl font-semibold tracking-tight">Scan test barcodes</h1>
      <p className="mt-2 text-base opacity-80">
        Print or scan from this screen with the phone. Expected colors are for persona Maria (DM+HTN).
      </p>
      {loading ? <p className="mt-6">Loading…</p> : null}
      {error ? (
        <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
          Live /dev/barcodes unavailable ({error}). Showing contract fallback kit.
        </p>
      ) : null}
      <div className="mt-8 grid gap-8">
        {rows.map((row) => (
          <article
            key={row.code}
            className="break-inside-avoid rounded-2xl border border-[#e8e0d5] bg-white p-4 print:border-black"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-medium">{row.name || row.code}</h2>
              <span className="text-sm uppercase tracking-wide">
                {row.persona} · expected {row.expected || "—"}
              </span>
            </div>
            <div className="mt-3 overflow-x-auto">
              <Barcode value={row.code} />
            </div>
            <p className="mt-2 font-mono text-sm">{row.code}</p>
          </article>
        ))}
      </div>
    </main>
  );
}

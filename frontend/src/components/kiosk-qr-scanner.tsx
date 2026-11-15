"use client";

/**
 * Callers: frontend/src/app/checkout/page.tsx (staff scans the shopper checkout QR).
 * No prior scanner component. Uses html5-qrcode; emits decoded QR string.
 * User: "make sure our frontends have a qr code scanning checking implemented"
 */
import { Html5Qrcode } from "html5-qrcode";
import { useEffect, useId, useRef, useState } from "react";

type Props = {
  onScan: (value: string) => void;
  active?: boolean;
};

export function KioskQrScanner({ onScan, active = true }: Props) {
  const reactId = useId().replace(/:/g, "");
  const elementId = `kiosk-qr-${reactId}`;
  const onScanRef = useRef(onScan);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const scanner = new Html5Qrcode(elementId);

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 8, qrbox: { width: 240, height: 240 } },
        (decoded) => {
          const value = decoded.trim();
          if (value) onScanRef.current(value);
        },
        () => {
          /* ignore frame misses */
        },
      )
      .then(() => {
        if (!cancelled) {
          setError("");
          setReady(true);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setReady(false);
          setError(err instanceof Error ? err.message : "Camera unavailable — use keypad below");
        }
      });

    return () => {
      cancelled = true;
      scanner
        .stop()
        .then(() => scanner.clear())
        .catch(() => {
          /* already stopped */
        });
    };
  }, [active, elementId]);

  return (
    <div className="w-full max-w-md space-y-2">
      <div
        id={elementId}
        className="min-h-[240px] overflow-hidden rounded-2xl border border-[#e8e0d5] bg-black"
      />
      {!ready && !error ? (
        <p className="text-center text-sm text-muted-foreground">Starting camera…</p>
      ) : null}
      {error ? <p className="text-center text-sm text-amber-700">{error}</p> : null}
    </div>
  );
}

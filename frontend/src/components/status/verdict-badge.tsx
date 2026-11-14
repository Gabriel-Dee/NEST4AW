import { Badge } from "@/components/ui/badge";
import type { Verdict } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AlertTriangle, Ban, CheckCircle2, HelpCircle } from "lucide-react";

const COPY: Record<
  Verdict,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  green: {
    label: "Approved",
    icon: CheckCircle2,
    className: "bg-verdict-green text-verdict-green-fg border-transparent",
  },
  yellow: {
    label: "Capped",
    icon: AlertTriangle,
    className: "bg-verdict-yellow text-verdict-yellow-fg border-transparent",
  },
  red: {
    label: "Restricted",
    icon: Ban,
    className: "bg-verdict-red text-verdict-red-fg border-transparent",
  },
  unknown: {
    label: "Unknown — blocked",
    icon: HelpCircle,
    className: "bg-muted text-foreground border-transparent",
  },
};

/** Paints a server verdict. Never invents green/yellow/red. */
export function VerdictBadge({
  verdict,
  capLimit,
  className,
}: {
  verdict: Verdict;
  capLimit?: number;
  className?: string;
}) {
  const meta = COPY[verdict];
  const Icon = meta.icon;
  const label =
    verdict === "yellow" && capLimit != null
      ? `Capped – limit ${capLimit}`
      : meta.label;

  return (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1.5 rounded-full px-2.5 py-1 font-medium",
        meta.className,
        className,
      )}
      aria-label={`Status: ${label}`}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span>{label}</span>
    </Badge>
  );
}

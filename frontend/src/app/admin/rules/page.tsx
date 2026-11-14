"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listRules, type RuleRecord } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";

const COLOR = {
  red: "border-red-200 bg-red-50 text-red-800",
  yellow: "border-amber-300 bg-amber-50 text-amber-800",
  green: "border-emerald-200 bg-emerald-50 text-emerald-800",
} as const;

const NUTRIENT: Record<string, string> = { NA: "Sodium", SUG: "Sugar", K: "Potassium", P: "Phosphorus", CARB: "Carbs", GI: "Glycemic index", ALG: "Allergen", FIB: "Fiber" };
const BAND: Record<string, string> = { R: "red band", Y: "yellow band", G: "green band", MISS: "missing data", DRINK: "sweet drinks" };

/** NA_R → "Sodium · red band". Unknown codes fall back to the code itself. */
function ruleName(id: string) {
  const [head, ...rest] = String(id).split("_");
  const n = NUTRIENT[head];
  if (!n) return id;
  const tail = rest.join("_");
  return tail ? `${n} · ${BAND[tail] ?? tail.toLowerCase()}` : n;
}

export default function RulesPage() {
  const { user } = useAuth();
  const [rules, setRules] = useState<RuleRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || (user.role !== "doctor" && user.role !== "admin")) return;
    listRules()
      .then(setRules)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load rules"));
  }, [user]);

  const [q, setQ] = useState("");
  const unsigned = rules.filter((rule) => !rule.rd_confirm).length;
  const shown = rules.filter((r) => `${r.rule_id} ${ruleName(r.rule_id)} ${r.note ?? ""} ${r.source}`.toLowerCase().includes(q.toLowerCase()));
  const byColor = (c: string) => rules.filter((r) => String(r.color).toLowerCase() === c).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="outline" className="rounded-full">{rules.length} rules</Badge>
          <Badge variant="outline" className={`rounded-full ${COLOR.red}`}>{byColor("red")} red</Badge>
          <Badge variant="outline" className={`rounded-full ${COLOR.yellow}`}>{byColor("yellow")} yellow</Badge>
          <Badge variant="outline" className={`rounded-full ${COLOR.green}`}>{byColor("green")} green</Badge>
        </div>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search rules" aria-label="Search rules" className="h-10 w-64 rounded-xl" />
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {unsigned > 0 ? (
        <Alert>
          <AlertTitle>Dietitian has not signed</AlertTitle>
          <AlertDescription>
            {unsigned} of {rules.length} rules have rd_confirm false.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rule</TableHead>
              <TableHead>What it checks</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Threshold</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>RD confirm</TableHead>
              <TableHead>Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((rule) => (
              <TableRow key={rule.rule_id}>
                <TableCell className="font-mono text-xs">{rule.rule_id}</TableCell>
                <TableCell className="font-medium">{ruleName(rule.rule_id)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`rounded-full capitalize ${COLOR[String(rule.color).toLowerCase() as keyof typeof COLOR] ?? ""}`}>
                    {rule.color}
                  </Badge>
                </TableCell>
                <TableCell>{rule.threshold ?? ""}</TableCell>
                <TableCell>
                  <a href={rule.source_url} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
                    {rule.source}
                  </a>
                </TableCell>
                <TableCell>
                  {rule.rd_confirm ? (
                    <Badge className="rounded-full">Signed</Badge>
                  ) : (
                    <Badge variant="outline" className="rounded-full">
                      Not signed
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="max-w-xs text-sm">{rule.note}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

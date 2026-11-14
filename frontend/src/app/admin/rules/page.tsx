"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { mockApi } from "@/lib/mock/api";
import type { RuleRow } from "@/lib/types";
import { ClipboardList } from "lucide-react";
import { useMemo } from "react";

export default function RulesPage() {
  const rules: RuleRow[] = useMemo(() => mockApi.getRules(), []);
  const unsigned = rules.filter((r) => !r.rd_confirm).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Clinical rules matrix
        </h1>
        <p className="text-sm text-muted-foreground">
          Condition vs nutrient limits with source citations (display-only)
        </p>
      </div>

      {unsigned > 0 && (
        <Alert>
          <ClipboardList className="size-4" />
          <AlertTitle>Dietitian has not signed</AlertTitle>
          <AlertDescription>
            {unsigned} of {rules.length} rules show{" "}
            <code className="text-xs">rd_confirm: false</code> — matrix is not
            RD-confirmed for production use.
          </AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Condition</TableHead>
              <TableHead>Nutrient</TableHead>
              <TableHead>Green max</TableHead>
              <TableHead>Yellow max</TableHead>
              <TableHead>Red at</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>RD confirm</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((r, i) => (
              <TableRow key={`${r.condition}-${r.nutrient}-${i}`}>
                <TableCell className="font-medium">{r.condition}</TableCell>
                <TableCell>{r.nutrient}</TableCell>
                <TableCell className="text-sm">{r.green_max}</TableCell>
                <TableCell className="text-sm">{r.yellow_max}</TableCell>
                <TableCell className="text-sm">{r.red_at}</TableCell>
                <TableCell>
                  <a
                    href={r.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary underline-offset-2 hover:underline"
                  >
                    {r.source}
                  </a>
                </TableCell>
                <TableCell>
                  {r.rd_confirm ? (
                    <Badge className="rounded-full">Signed</Badge>
                  ) : (
                    <Badge variant="outline" className="rounded-full">
                      Not signed
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

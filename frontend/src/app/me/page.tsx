"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { myProfile, myVisits, type MyProfile, type VisitRow } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";

export default function MePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role !== "client") return;
    Promise.all([myProfile(), myVisits()])
      .then(([nextProfile, nextVisits]) => {
        setProfile(nextProfile);
        setVisits(nextVisits);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your record"));
  }, [user]);

  const flags = profile
    ? [
        profile.dm ? "DM" : null,
        profile.htn ? "HTN" : null,
        profile.ckd34 ? "CKD 3–4" : null,
        profile.k_limit_ordered ? "Potassium limit" : null,
        ...profile.allergens,
      ].filter((item): item is string => Boolean(item))
    : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {error ? <p className="text-destructive">{error}</p> : null}
      {profile ? (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>{profile.legal_name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{profile.email}</p>
            <Badge className="rounded-full">Tier {profile.tier_id}</Badge>
            <p>Household of {profile.household_size}</p>
            <p>Card {profile.token_status}</p>
            <div className="flex flex-wrap gap-1.5">
              {flags.map((flag) => (
                <Badge key={flag} variant="outline" className="rounded-full">
                  {flag}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Grant</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visits.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No visits yet.
                </TableCell>
              </TableRow>
            ) : (
              visits.map((visit, index) => (
                <TableRow key={`${visit.sold_at}-${index}`}>
                  <TableCell>{visit.product_name}</TableCell>
                  <TableCell>{visit.grant_id}</TableCell>
                  <TableCell>{visit.tier_id}</TableCell>
                  <TableCell>{visit.qty}</TableCell>
                  <TableCell>{visit.sold_at}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

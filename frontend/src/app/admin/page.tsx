"use client";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ClipboardList, LayoutDashboard, Stethoscope } from "lucide-react";
import Link from "next/link";

const LINKS = [
  {
    href: "/admin/clinical",
    title: "Clinical intake",
    description: "ICD-10 profile, allergies, proposed diet tier",
    icon: Stethoscope,
  },
  {
    href: "/admin/analytics",
    title: "Analytics",
    description: "Anonymized KPIs, trends, grant CSV export",
    icon: LayoutDashboard,
  },
  {
    href: "/admin/rules",
    title: "Rules matrix",
    description: "Condition vs nutrient limits with citations",
    icon: ClipboardList,
  },
] as const;

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Program overview — open a workspace below
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="group">
              <Card className="h-full rounded-2xl transition-colors group-hover:border-primary/40 group-hover:bg-muted/40">
                <CardHeader>
                  <Icon className="mb-2 size-5 text-primary" aria-hidden />
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

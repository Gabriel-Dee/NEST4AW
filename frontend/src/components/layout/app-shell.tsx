"use client";

import { Button } from "@/components/ui/button";
import { roleHome } from "@/lib/api";
import { roleLabel, useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Package,
  ScanLine,
  ShoppingCart,
  Stethoscope,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const NAV: {
  href: string;
  label: string;
  icon: typeof ShoppingCart;
  roles: Role[];
}[] = [
  {
    href: "/checkout",
    label: "Checkout",
    icon: ShoppingCart,
    roles: ["warehouse_staff", "admin"],
  },
  {
    href: "/warehouse",
    label: "Warehouse",
    icon: Package,
    roles: ["warehouse_staff", "admin"],
  },
  {
    href: "/admin/clinical",
    label: "Clinical intake",
    icon: Stethoscope,
    roles: ["doctor", "admin"],
  },
  {
    href: "/admin/analytics",
    label: "Grant report",
    icon: LayoutDashboard,
    roles: ["admin", "community_partner"],
  },
  {
    href: "/admin/rules",
    label: "Rules matrix",
    icon: ClipboardList,
    roles: ["doctor", "admin"],
  },
  {
    href: "/admin",
    label: "Users",
    icon: Users,
    roles: ["admin"],
  },
  {
    href: "/me",
    label: "My record",
    icon: UserRound,
    roles: ["client"],
  },
  {
    href: "/kiosk/display",
    label: "Kiosk QR",
    icon: ScanLine,
    roles: ["warehouse_staff", "admin"],
  },
  {
    href: "/kiosk",
    label: "Kiosk scan",
    icon: ScanLine,
    roles: ["warehouse_staff", "admin"],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, ready, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isKioskScan = pathname === "/kiosk";
  const isLogin = pathname.startsWith("/login");

  useEffect(() => {
    if (!ready || isLogin || isKioskScan) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    const allowed = NAV.some((item) => {
      if (!item.roles.includes(user.role)) return false;
      if (item.href === "/admin") return pathname === "/admin";
      return pathname === item.href || pathname.startsWith(`${item.href}/`);
    });
    if (!allowed && pathname !== roleHome(user.role)) router.replace(roleHome(user.role));
  }, [ready, user, router, isLogin, isKioskScan, pathname]);

  if (isLogin || isKioskScan) {
    return <>{children}</>;
  }

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  const links = NAV.filter((n) => n.roles.includes(user.role));

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-4">
        <div className="mb-6 px-2">
          <p className="text-xs font-medium tracking-wide text-primary uppercase">
            Epic Cure
          </p>
          <p className="text-sm font-semibold text-foreground">MTG Warehouse</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {links.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b bg-card/80 px-6 backdrop-blur">
          <div>
            <p className="text-sm font-medium">{user.displayName}</p>
            <p className="text-xs text-muted-foreground">
              {roleLabel(user.role)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => {
              logout();
              router.push("/login");
            }}
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

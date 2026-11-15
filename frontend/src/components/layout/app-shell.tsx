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
  Menu,
  Package,
  QrCode,
  ShoppingCart,
  Stethoscope,
  UserRound,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type NavItem = {
  href: string;
  label: string;
  hint: string;
  icon: typeof ShoppingCart;
  roles: Role[];
  group: "Floor" | "Clinical" | "Admin" | "Me";
};

const NAV: NavItem[] = [
  { href: "/checkout", label: "Checkout", hint: "Scan carts at the exit and stop restricted items.", icon: ShoppingCart, roles: ["warehouse_staff", "admin"], group: "Floor" },
  { href: "/warehouse", label: "Warehouse", hint: "Floor board, stock levels and lots.", icon: Package, roles: ["warehouse_staff", "admin"], group: "Floor" },
  { href: "/kiosk/display", label: "Kiosk QR", hint: "Show the store check-in code for shoppers to scan.", icon: QrCode, roles: ["warehouse_staff", "admin"], group: "Floor" },
  { href: "/admin/clinical", label: "Clinical intake", hint: "Enroll clients and record conditions.", icon: Stethoscope, roles: ["doctor", "admin"], group: "Clinical" },
  { href: "/admin/rules", label: "Rules matrix", hint: "The clinical thresholds behind every color.", icon: ClipboardList, roles: ["doctor", "admin"], group: "Clinical" },
  { href: "/admin/analytics", label: "Grant report", hint: "Anonymized distribution by grant and tier.", icon: LayoutDashboard, roles: ["admin", "community_partner"], group: "Admin" },
  { href: "/admin", label: "Users", hint: "Staff accounts and roles.", icon: Users, roles: ["admin"], group: "Admin" },
  { href: "/me", label: "My record", hint: "Your profile and visits.", icon: UserRound, roles: ["client"], group: "Me" },
];

const GROUPS: NavItem["group"][] = ["Floor", "Clinical", "Admin", "Me"];

/**
 * The single most specific nav item for a path. "/kiosk/display" matches both "/kiosk" and
 * "/kiosk/display"; the longest href wins, so only one item is ever highlighted.
 */
function activeItem(pathname: string, items: NavItem[]) {
  return items
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

function initials(name: string) {
  return name
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, ready, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isLogin = pathname.startsWith("/login");

  useEffect(() => {
    if (!ready || isLogin) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    const allowed = activeItem(pathname, NAV.filter((i) => i.roles.includes(user.role)));
    if (!allowed && pathname !== roleHome(user.role)) router.replace(roleHome(user.role));
  }, [ready, user, router, isLogin, pathname]);

  if (isLogin) {
    return <>{children}</>;
  }

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground" role="status">
        Loading…
      </div>
    );
  }

  const links = NAV.filter((n) => n.roles.includes(user.role));
  const current = activeItem(pathname, links);

  const nav = (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto" aria-label="Main">
      {GROUPS.map((group) => {
        const items = links.filter((i) => i.group === group);
        if (!items.length) return null;
        return (
          <div key={group} className="flex flex-col gap-1">
            <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{group}</p>
            {items.map((item) => {
              const active = current?.href === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    active
                      ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-[18px] shrink-0" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  const account = (
    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-sidebar-border bg-card p-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground" aria-hidden>
        {initials(user.displayName) || "?"}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={user.displayName}>
          {user.displayName}
        </p>
        <p className="text-xs text-muted-foreground">{roleLabel(user.role)}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Sign out"
        title="Sign out"
        onClick={() => {
          logout();
          router.push("/login");
        }}
      >
        <LogOut className="size-4" />
      </Button>
    </div>
  );

  const brand = (
    <Link href={roleHome(user.role)} className="block px-3">
      <p className="text-xs font-semibold tracking-wider text-primary uppercase">Epic Cure</p>
      <p className="text-base font-semibold text-foreground">MTG Warehouse</p>
    </Link>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 lg:flex">
        <div className="mb-6">{brand}</div>
        {nav}
        {account}
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-sidebar px-3 py-5 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              {brand}
              <Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setOpen(false)}>
                <X className="size-5" />
              </Button>
            </div>
            {nav}
            {account}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b bg-card/85 px-4 backdrop-blur md:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <div className="min-w-0 flex-1 py-2">
            {current ? (
              <>
                <p className="text-xs font-medium text-muted-foreground">{current.group}</p>
                <h1 className="truncate text-lg font-semibold leading-tight">{current.label}</h1>
              </>
            ) : null}
          </div>
          {current?.hint ? <p className="hidden max-w-sm text-right text-sm text-muted-foreground xl:block">{current.hint}</p> : null}
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

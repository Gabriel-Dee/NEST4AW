"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createUser, listUsers, patchUser, type StaffUser } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ClipboardList, LayoutDashboard, Stethoscope } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

const LINKS = [
  {
    href: "/admin/clinical",
    title: "Clinical intake",
    description: "Enroll a client. The server assigns the tier.",
    icon: Stethoscope,
  },
  {
    href: "/admin/analytics",
    title: "Grant report",
    description: "Dispensed units and pounds by day, tier, and grant",
    icon: LayoutDashboard,
  },
  {
    href: "/admin/rules",
    title: "Rules matrix",
    description: "Server rules, including rd_confirm",
    icon: ClipboardList,
  },
] as const;

const ROLES = ["doctor", "warehouse_staff", "admin", "community_partner"] as const;

export default function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("warehouse_staff");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user?.role !== "admin") return;
    listUsers()
      .then(setUsers)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load users"));
  }, [user]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createUser({ email: email.trim(), password, role });
      setEmail("");
      setPassword("");
      setUsers(await listUsers());
      toast.success("User created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the user");
    } finally {
      setBusy(false);
    }
  }

  async function toggleDisabled(row: StaffUser) {
    setBusy(true);
    try {
      await patchUser(row.id, { disabled: !row.disabled });
      setUsers(await listUsers());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the user");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted-foreground">Staff accounts and the program workspaces you can open.</p>
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

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>Create a staff account or disable one. Client accounts are enrolled in Clinical.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex flex-wrap items-end gap-3" onSubmit={onCreate}>
            <div className="space-y-1.5">
              <Label htmlFor="user-email">Email</Label>
              <Input id="user-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-10 w-64 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-password">Password</Label>
              <Input id="user-password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="h-10 w-48 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(value) => setRole((value as (typeof ROLES)[number]) ?? "warehouse_staff")}>
                <SelectTrigger className="h-10 w-52 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="rounded-xl" disabled={busy}>
              Create
            </Button>
          </form>
          <ul className="divide-y rounded-xl border">
            {users.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm">
                <span>
                  {row.email} · {row.role}
                  {row.disabled ? " · disabled" : ""}
                </span>
                <Button type="button" variant="outline" className="rounded-xl" disabled={busy} onClick={() => toggleDisabled(row)}>
                  {row.disabled ? "Enable" : "Disable"}
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

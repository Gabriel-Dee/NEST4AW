"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { roleHome } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Eye, EyeOff, LayoutDashboard, Package, ScanLine, ShoppingCart, Stethoscope } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const ROLES = [
  { icon: ShoppingCart, title: "Warehouse staff", body: "Check carts out and stop restricted items." },
  { icon: Package, title: "Inventory", body: "Watch stock, lots and expiring food." },
  { icon: Stethoscope, title: "Clinical staff", body: "Enroll clients and set their diet plan." },
  { icon: LayoutDashboard, title: "Partners", body: "See anonymized impact and grant reports." },
];

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const user = await login(email, password);
      router.replace(roleHome(user.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Check your email and password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      {/* Brand panel */}
      <section className="hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <div>
          <p className="text-sm font-semibold tracking-wider uppercase opacity-80">Epic Cure</p>
          <h1 className="mt-3 max-w-md text-4xl leading-tight font-semibold">Medically tailored groceries, safely to every family.</h1>
          <p className="mt-4 max-w-md text-base opacity-85">
            One sign-in for the warehouse team. Every screen shows only what your role needs.
          </p>
        </div>
        <ul className="grid max-w-lg gap-4 sm:grid-cols-2">
          {ROLES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-2xl bg-white/10 p-4">
              <Icon className="size-5" aria-hidden />
              <p className="mt-2 font-semibold">{title}</p>
              <p className="text-sm opacity-85">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Form */}
      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-wider text-primary uppercase lg:hidden">Epic Cure</p>
            <h2 className="text-3xl font-semibold tracking-tight">Sign in</h2>
            <p className="text-muted-foreground">Use your Epic Cure staff account.</p>
          </div>

          <form className="space-y-5" onSubmit={onSubmit} noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-invalid={!!error}
                className="h-12 rounded-xl text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  aria-invalid={!!error}
                  className="h-12 rounded-xl pr-12 text-base"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-1/2 right-1 -translate-y-1/2"
                  aria-label={show ? "Hide password" : "Show password"}
                  aria-pressed={show}
                  onClick={() => setShow((v) => !v)}
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
            </div>
            {error ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" className="h-12 w-full rounded-xl text-base" disabled={loading || !email || !password}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="rounded-2xl border bg-card p-4 text-sm">
            <p className="font-medium">Setting up a kiosk?</p>
            <p className="mt-1 text-muted-foreground">The self-check-in scanner runs full screen without a staff login.</p>
            <Link href="/kiosk" className="mt-3 inline-flex items-center gap-2 font-medium text-primary underline-offset-4 hover:underline">
              <ScanLine className="size-4" aria-hidden />
              Open kiosk scanner
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

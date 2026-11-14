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
import { useAuth } from "@/lib/auth";
import { mockApi } from "@/lib/mock/api";
import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("staff@demo.local");
  const [password, setPassword] = useState("nest-local-demo");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const user = await login(email, password);
      router.replace(mockApi.roleHome(user.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md rounded-2xl shadow-sm">
        <CardHeader className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-primary uppercase">
            Epic Cure
          </p>
          <CardTitle className="text-2xl">MTG Warehouse sign-in</CardTitle>
          <CardDescription>
            One login, then role-gated screens for checkout, warehouse, and
            program staff.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="flex items-center gap-1.5">
                Password
                <Lock className="size-3.5 text-muted-foreground" aria-hidden />
                <span className="text-xs text-muted-foreground">Encrypted</span>
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11 rounded-xl"
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button
              type="submit"
              className="h-11 w-full rounded-full"
              disabled={loading}
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="mt-4 text-xs text-muted-foreground">
            Demo: staff@demo.local · doctor@demo.local · admin@demo.local ·
            password nest-local-demo
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Kiosk check-in is public at{" "}
            <a className="text-primary underline" href="/kiosk">
              /kiosk
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

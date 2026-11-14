"use client";

import { useAuth } from "@/lib/auth";
import { mockApi } from "@/lib/mock/api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function HomePage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    router.replace(mockApi.roleHome(user.role));
  }, [ready, user, router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      Loading…
    </div>
  );
}

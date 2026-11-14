"use client";

import {
  getAccessToken,
  login as apiLogin,
  logout as apiLogout,
  me,
  setAccessToken,
  type AuthUser,
} from "@/lib/api";
import type { Role } from "@/lib/types";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type AuthContextValue = {
  user: AuthUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancel = false;
    const done = (next: AuthUser | null) => {
      if (cancel) return;
      setUser(next);
      setReady(true);
    };
    if (!getAccessToken()) {
      queueMicrotask(() => done(null));
      return () => {
        cancel = true;
      };
    }
    me()
      .then(done)
      .catch(() => {
        setAccessToken(null);
        done(null);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const next = await apiLogin(email, password);
    setUser(next);
    return next;
  }, []);

  const logout = useCallback(() => {
    apiLogout();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, ready, login, logout }), [user, ready, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function roleLabel(role: Role) {
  switch (role) {
    case "warehouse_staff":
      return "Warehouse staff";
    case "doctor":
      return "Program clinician";
    case "admin":
      return "Program director";
    case "community_partner":
      return "Community partner";
    case "client":
      return "Client";
  }
}
